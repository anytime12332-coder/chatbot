const express = require('express');
const prisma = require('../lib/prisma');
const { getAIResponse, getAIResponseStreaming } = require('../lib/aiProviders');
const { decrypt } = require('../lib/encryption');
const { aiQueue } = require('../lib/queue');
const { v4: uuidv4 } = require('uuid');
const { authMiddleware } = require('../lib/auth');
const https = require('https');
const http = require('http');

const router = express.Router();

/**
 * Build the system prompt from chatbot config
 */
function buildSystemPrompt(chatbot) {
  const parts = [];
  if (chatbot.systemPrompt) parts.push(chatbot.systemPrompt);
  if (chatbot.businessName) parts.push(`Business Name: ${chatbot.businessName}`);
  if (chatbot.businessInfo) parts.push(`Business Information: ${chatbot.businessInfo}`);
  return parts.join('\n\n');
}

/**
 * Get or create conversation + build AI messages
 */
async function prepareChat(message, sessionId, chatbotId, pageUrl, ip) {
  const chatbot = await prisma.chatbot.findUnique({
    where: { id: chatbotId },
    include: { apiConfig: true },
  });

  if (!chatbot) throw { status: 404, message: 'Bot not found' };
  if (!chatbot.isActive) throw { status: 403, message: 'Bot is currently disabled' };
  if (!chatbot.apiConfig?.apiKey) throw { status: 500, message: 'Bot is not configured properly' };

  const currentSessionId = sessionId || uuidv4();

  let conversation = await prisma.conversation.findFirst({
    where: { sessionId: currentSessionId, chatbotId, status: 'active' },
    include: {
      messages: { orderBy: { createdAt: 'desc' }, take: 20 },
    },
  });

  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: { sessionId: currentSessionId, chatbotId, visitorIp: ip || '', pageUrl: pageUrl || '' },
      include: { messages: true },
    });
  }

  // The most recent 20 messages are fetched newest-first; restore chronological order
  const history = [...conversation.messages].reverse();

  // Save user message and bump the conversation's updatedAt so inbox/dashboard
  // lists ordered by updatedAt reflect the latest activity
  await prisma.message.create({
    data: { role: 'user', content: message.trim(), conversationId: conversation.id },
  });
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { updatedAt: new Date() },
  });

  // Build AI messages
  let systemPromptText = '';
  if (chatbot.ragEnabled) {
    const { retrieveRelevantContext } = require('../lib/rag');
    const retrievedContext = await retrieveRelevantContext(message.trim(), chatbot);
    
    const parts = [];
    if (chatbot.systemPrompt) parts.push(chatbot.systemPrompt);
    if (chatbot.businessName) parts.push(`Business Name: ${chatbot.businessName}`);
    if (retrievedContext) {
      parts.push(`Relevant Business Context (use this to answer user questions):\n${retrievedContext}`);
    } else if (chatbot.businessInfo) {
      parts.push(`Business Information: ${chatbot.businessInfo}`);
    }
    systemPromptText = parts.join('\n\n');
  } else {
    systemPromptText = buildSystemPrompt(chatbot);
  }

  const aiMessages = [
    { role: 'system', content: systemPromptText },
    ...history.map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: message.trim() },
  ];

  // Decrypt API key
  const decryptedConfig = {
    ...chatbot.apiConfig,
    apiKey: decrypt(chatbot.apiConfig.apiKey),
  };

  return { chatbot, conversation, currentSessionId, aiMessages, decryptedConfig };
}

/**
 * Triggers n8n webhook with lead details
 */
async function triggerWebhook(url, payload) {
  if (!url) return;
  return new Promise((resolve) => {
    try {
      const parsedUrl = new URL(url);
      const client = parsedUrl.protocol === 'https:' ? https : http;
      const body = JSON.stringify(payload);
      
      const req = client.request({
        hostname: parsedUrl.hostname,
        port: parsedUrl.port,
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
        timeout: 10000,
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          resolve({ status: res.statusCode, data });
        });
      });

      req.on('error', (err) => {
        console.error('Webhook error:', err);
        resolve({ error: err.message });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({ error: 'Webhook timeout' });
      });

      req.write(body);
      req.end();
    } catch (err) {
      console.error('Webhook parsing error:', err);
      resolve({ error: err.message });
    }
  });
}

/**
 * Classifies if the message triggers lead capture
 */
async function classifyIntent(message, triggerPrompt, aiConfig) {
  try {
    const classificationMessages = [
      {
        role: 'system',
        content: `You are an AI assistant analyzing a conversation to determine if we should start collecting lead information (like name, email, phone number).
Determine if the user's latest message indicates interest in the business's services, hiring, requesting a quote/price, getting support, or becoming a lead/contacting.
Trigger prompt to match: "${triggerPrompt}"

Respond with exactly "YES" if the condition matches, otherwise respond with "NO". Do not include any other text.`
      },
      {
        role: 'user',
        content: `User message: "${message}"`
      }
    ];

    const result = await getAIResponse(classificationMessages, aiConfig);
    const content = result.content?.trim().toUpperCase();
    return content.includes('YES');
  } catch (err) {
    console.error('Intent classification failed:', err);
    return false;
  }
}

/**
 * Extracts a structured value for a field from user response
 */
async function extractValue(message, questionLabel, questionPrompt, aiConfig) {
  try {
    const extractionMessages = [
      {
        role: 'system',
        content: `You are an AI that extracts information from user messages.
Your task is to extract the answer for "${questionLabel}" from the user's response.
Reply with ONLY the clean extracted value (e.g. just the email, name, or phone number).
If the response doesn't contain a clear value, reply with the raw response. Do not add any explanation.`
      },
      {
        role: 'user',
        content: `Question asked: "${questionPrompt}"\nUser response: "${message}"`
      }
    ];

    const result = await getAIResponse(extractionMessages, aiConfig);
    return result.content?.trim() || message;
  } catch (err) {
    console.error('Value extraction failed:', err);
    return message;
  }
}

/**
 * Handles the conversational lead collection intercept.
 * Returns true if the message was handled by the lead flow, false if we should fall back to normal chat.
 */
async function handleLeadCollection(chatbot, conversation, message, res, isStreaming, decryptedConfig, currentSessionId) {
  let questions = [];
  try {
    questions = JSON.parse(chatbot.leadQuestions || '[]');
  } catch (e) {
    console.error('Failed to parse lead questions:', e);
  }

  if (conversation.leadStatus === 'collecting') {
    const currentQuestion = questions[conversation.currentQuestionIndex];
    if (!currentQuestion) {
      // Index is out of bounds, set status to completed
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { leadStatus: 'completed', updatedAt: new Date() }
      });
      return false;
    }

    // Extract value from user answer
    const extractedVal = await extractValue(message.trim(), currentQuestion.label, currentQuestion.question, decryptedConfig);
    
    let collected = {};
    try {
      collected = JSON.parse(conversation.collectedData || '{}');
    } catch(e) {}
    
    collected[currentQuestion.id || currentQuestion.label] = extractedVal;
    const collectedDataStr = JSON.stringify(collected);
    
    const nextIndex = conversation.currentQuestionIndex + 1;
    
    if (nextIndex < questions.length) {
      // Save and show next question
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          currentQuestionIndex: nextIndex,
          collectedData: collectedDataStr,
          updatedAt: new Date()
        }
      });

      // Upsert Lead row progressively
      await prisma.lead.upsert({
        where: { conversationId: conversation.id },
        update: { details: collectedDataStr },
        create: {
          chatbotId: chatbot.id,
          conversationId: conversation.id,
          details: collectedDataStr
        }
      });
      
      const nextQuestion = questions[nextIndex];
      const assistantMessage = await prisma.message.create({
        data: {
          role: 'assistant',
          content: nextQuestion.question,
          conversationId: conversation.id,
        }
      });

      if (isStreaming) {
        res.write(`data: ${JSON.stringify({ type: 'start', sessionId: currentSessionId, conversationId: conversation.id })}\n\n`);
        res.write(`data: ${JSON.stringify({ type: 'chunk', content: nextQuestion.question })}\n\n`);
        res.write(`data: ${JSON.stringify({ type: 'done', messageId: assistantMessage.id, tokenCount: 0, responseTimeMs: 0 })}\n\n`);
        res.end();
      } else {
        res.json({
          reply: nextQuestion.question,
          sessionId: currentSessionId,
          messageId: assistantMessage.id,
          conversationId: conversation.id
        });
      }
      return true;
    } else {
      // Lead collection completed
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          leadStatus: 'completed',
          collectedData: collectedDataStr,
          updatedAt: new Date()
        }
      });
      
      // Upsert final Lead row
      const lead = await prisma.lead.upsert({
        where: { conversationId: conversation.id },
        update: { details: collectedDataStr },
        create: {
          chatbotId: chatbot.id,
          conversationId: conversation.id,
          details: collectedDataStr
        }
      });
      
      // Fire webhook
      if (chatbot.webhookUrl) {
        triggerWebhook(chatbot.webhookUrl, {
          event: 'lead.captured',
          leadId: lead.id,
          chatbotId: chatbot.id,
          chatbotName: chatbot.name,
          conversationId: conversation.id,
          details: collected,
          createdAt: lead.createdAt
        }).catch(err => console.error('Error firing webhook:', err));
      }
      
      // Thank the user with a natural AI response
      const finalPrompt = [
        {
          role: 'system',
          content: `The lead collection is complete. Here are the details collected:
${Object.entries(collected).map(([k, v]) => `- ${k}: ${v}`).join('\n')}

Politely thank the user for providing their details and let them know we will get back to them. If they have any other questions, they can ask.`
        },
        {
          role: 'user',
          content: message.trim()
        }
      ];
      
      if (isStreaming) {
        res.write(`data: ${JSON.stringify({ type: 'start', sessionId: currentSessionId, conversationId: conversation.id })}\n\n`);
        
        const startTime = Date.now();
        let fullContent = '';
        const aiResult = await aiQueue.add(() =>
          getAIResponseStreaming(finalPrompt, decryptedConfig, (chunk) => {
            fullContent += chunk;
            res.write(`data: ${JSON.stringify({ type: 'chunk', content: chunk })}\n\n`);
          })
        );
        const responseTimeMs = Date.now() - startTime;
        
        const assistantMessage = await prisma.message.create({
          data: {
            role: 'assistant',
            content: aiResult.content || fullContent,
            tokenCount: aiResult.tokenCount || 0,
            responseTimeMs,
            conversationId: conversation.id,
          }
        });
        
        res.write(`data: ${JSON.stringify({
          type: 'done',
          messageId: assistantMessage.id,
          tokenCount: aiResult.tokenCount || 0,
          responseTimeMs
        })}\n\n`);
        res.end();
      } else {
        const startTime = Date.now();
        const aiResult = await aiQueue.add(() => getAIResponse(finalPrompt, decryptedConfig));
        const responseTimeMs = Date.now() - startTime;
        
        const assistantMessage = await prisma.message.create({
          data: {
            role: 'assistant',
            content: aiResult.content,
            tokenCount: aiResult.tokenCount,
            responseTimeMs,
            conversationId: conversation.id,
          }
        });
        
        res.json({
          reply: aiResult.content,
          sessionId: currentSessionId,
          messageId: assistantMessage.id,
          conversationId: conversation.id
        });
      }
      return true;
    }
  } else if (conversation.leadStatus === 'inactive' && chatbot.leadCollectionEnabled && questions.length > 0) {
    // Check if user triggers lead capture
    const isLeadIntent = await classifyIntent(message.trim(), chatbot.leadTriggerPrompt, decryptedConfig);
    if (isLeadIntent) {
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          leadStatus: 'collecting',
          currentQuestionIndex: 0,
          updatedAt: new Date()
        }
      });
      
      const firstQuestion = questions[0];
      const assistantMessage = await prisma.message.create({
        data: {
          role: 'assistant',
          content: firstQuestion.question,
          conversationId: conversation.id,
        }
      });

      if (isStreaming) {
        res.write(`data: ${JSON.stringify({ type: 'start', sessionId: currentSessionId, conversationId: conversation.id })}\n\n`);
        res.write(`data: ${JSON.stringify({ type: 'chunk', content: firstQuestion.question })}\n\n`);
        res.write(`data: ${JSON.stringify({ type: 'done', messageId: assistantMessage.id, tokenCount: 0, responseTimeMs: 0 })}\n\n`);
        res.end();
      } else {
        res.json({
          reply: firstQuestion.question,
          sessionId: currentSessionId,
          messageId: assistantMessage.id,
          conversationId: conversation.id
        });
      }
      return true;
    }
  }
  
  return false;
}

// POST /api/chat/message - Non-streaming chat (backward compatible)
router.post('/message', async (req, res) => {
  try {
    const { message, sessionId, botId, pageUrl } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // If no botId, find the first active chatbot
    let chatbotId = botId;
    if (!chatbotId) {
      const defaultBot = await prisma.chatbot.findFirst({ where: { isActive: true } });
      if (!defaultBot) return res.status(404).json({ error: 'No active bot found' });
      chatbotId = defaultBot.id;
    }

    const { chatbot, conversation, currentSessionId, aiMessages, decryptedConfig } = await prepareChat(
      message, sessionId, chatbotId, pageUrl, req.ip
    );

    // Intercept for conversational lead collection
    const leadHandled = await handleLeadCollection(
      chatbot, conversation, message, res, false, decryptedConfig, currentSessionId
    );
    if (leadHandled) return;

    const startTime = Date.now();
    const aiResult = await aiQueue.add(() => getAIResponse(aiMessages, decryptedConfig));
    const responseTimeMs = Date.now() - startTime;

    const assistantMessage = await prisma.message.create({
      data: {
        role: 'assistant',
        content: aiResult.content,
        tokenCount: aiResult.tokenCount,
        responseTimeMs,
        conversationId: conversation.id,
      },
    });

    res.json({
      reply: aiResult.content,
      sessionId: currentSessionId,
      messageId: assistantMessage.id,
      conversationId: conversation.id,
    });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error('Chat error:', error);
    if (error.message?.includes('timed out')) {
      return res.status(504).json({ error: 'Response timed out. Please try again.' });
    }
    res.status(500).json({ error: 'Failed to get response. Please try again.' });
  }
});

// POST /api/chat/stream - SSE streaming chat
router.post('/stream', async (req, res) => {
  try {
    const { message, sessionId, botId, pageUrl } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Message is required' });
    }

    let chatbotId = botId;
    if (!chatbotId) {
      const defaultBot = await prisma.chatbot.findFirst({ where: { isActive: true } });
      if (!defaultBot) return res.status(404).json({ error: 'No active bot found' });
      chatbotId = defaultBot.id;
    }

    const { chatbot, conversation, currentSessionId, aiMessages, decryptedConfig } = await prepareChat(
      message, sessionId, chatbotId, pageUrl, req.ip
    );

    // Set up SSE headers BEFORE any streaming writes (including the lead intercept)
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    // Intercept for conversational lead collection (SSE headers already sent)
    const leadHandled = await handleLeadCollection(
      chatbot, conversation, message, res, true, decryptedConfig, currentSessionId
    );
    if (leadHandled) return;

    // Send session info first
    res.write(`data: ${JSON.stringify({ type: 'start', sessionId: currentSessionId, conversationId: conversation.id })}\n\n`);

    const startTime = Date.now();
    let fullContent = '';

    const aiResult = await aiQueue.add(() =>
      getAIResponseStreaming(aiMessages, decryptedConfig, (chunk) => {
        fullContent += chunk;
        res.write(`data: ${JSON.stringify({ type: 'chunk', content: chunk })}\n\n`);
      })
    );

    const responseTimeMs = Date.now() - startTime;

    // Save the complete assistant message
    const assistantMessage = await prisma.message.create({
      data: {
        role: 'assistant',
        content: aiResult.content || fullContent,
        tokenCount: aiResult.tokenCount || 0,
        responseTimeMs,
        conversationId: conversation.id,
      },
    });

    // Send completion event
    res.write(`data: ${JSON.stringify({
      type: 'done',
      messageId: assistantMessage.id,
      tokenCount: aiResult.tokenCount || 0,
      responseTimeMs,
    })}\n\n`);

    res.end();
  } catch (error) {
    if (error.status) {
      if (!res.headersSent) return res.status(error.status).json({ error: error.message });
    }
    console.error('Stream error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Streaming failed' });
    } else {
      res.write(`data: ${JSON.stringify({ type: 'error', error: 'Streaming failed' })}\n\n`);
      res.end();
    }
  }
});

// GET /api/chat/conversations/:chatbotId - List conversations for a chatbot (admin)
router.get('/conversations/:chatbotId', authMiddleware, async (req, res) => {
  try {
    const { chatbotId } = req.params;
    const { page = 1, limit = 20, status } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Verify ownership
    const chatbot = await prisma.chatbot.findFirst({
      where: { id: chatbotId, adminId: req.admin.id },
    });
    if (!chatbot) return res.status(404).json({ error: 'Chatbot not found' });

    const where = { chatbotId };
    if (status) where.status = status;

    const [conversations, total] = await Promise.all([
      prisma.conversation.findMany({
        where,
        include: {
          messages: { orderBy: { createdAt: 'desc' }, take: 1 },
          _count: { select: { messages: true } },
        },
        orderBy: { updatedAt: 'desc' },
        skip,
        take: parseInt(limit),
      }),
      prisma.conversation.count({ where }),
    ]);

    res.json({
      conversations,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit)),
    });
  } catch (error) {
    console.error('List conversations error:', error);
    res.status(500).json({ error: 'Failed to list conversations' });
  }
});

// GET /api/chat/conversation/:id - Get conversation detail
router.get('/conversation/:id', authMiddleware, async (req, res) => {
  try {
    const conversation = await prisma.conversation.findUnique({
      where: { id: req.params.id },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
        chatbot: { select: { adminId: true, name: true, leadQuestions: true } },
        lead: true,
      },
    });

    if (!conversation) return res.status(404).json({ error: 'Conversation not found' });
    if (conversation.chatbot.adminId !== req.admin.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(conversation);
  } catch (error) {
    console.error('Get conversation error:', error);
    res.status(500).json({ error: 'Failed to get conversation' });
  }
});

module.exports = router;
