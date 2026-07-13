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
 * Get or create conversation + build AI messages array.
 * Also returns the raw history array for use in classifyIntent.
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

  // Save user message and bump the conversation's updatedAt
  await prisma.message.create({
    data: { role: 'user', content: message.trim(), conversationId: conversation.id },
  });
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { updatedAt: new Date() },
  });

  // Build AI messages (with RAG if enabled)
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

  return { chatbot, conversation, currentSessionId, aiMessages, decryptedConfig, history };
}

/**
 * Triggers webhook with lead details.
 * Retries up to `retries` times with linear backoff.
 * Uses explicit UTF-8 byte length to avoid encoding bugs with non-ASCII characters.
 */
async function triggerWebhook(url, payload, retries = 3) {
  if (!url) return { error: 'No webhook URL provided' };

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const body = JSON.stringify(payload);
      const result = await new Promise((resolve, reject) => {
        const parsedUrl = new URL(url);
        const client = parsedUrl.protocol === 'https:' ? https : http;

        const req = client.request({
          hostname: parsedUrl.hostname,
          port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
          path: parsedUrl.pathname + parsedUrl.search,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Content-Length': Buffer.byteLength(body, 'utf8'),
            'X-Chatbot-Event': payload.event || 'lead.captured',
            'X-Attempt': String(attempt),
          },
          timeout: 10000,
        }, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => resolve({ status: res.statusCode, data }));
        });

        req.on('error', reject);
        req.on('timeout', () => {
          req.destroy();
          reject(new Error('TIMEOUT'));
        });

        req.write(body);
        req.end();
      });

      if (result.status >= 200 && result.status < 300) {
        return result;
      }
      throw new Error(`HTTP ${result.status}`);
    } catch (err) {
      console.warn(`Webhook attempt ${attempt}/${retries} failed:`, err.message);
      if (attempt < retries) {
        // Linear backoff: 1s, 2s, 3s...
        await new Promise(r => setTimeout(r, 1000 * attempt));
      } else {
        console.error('Webhook failed after all retries for URL:', url);
      }
    }
  }
  return { error: `Webhook failed after ${retries} attempts` };
}

/**
 * Classifies if the user message matches the lead capture trigger.
 * Uses conversation history for context and strict YES/NO matching.
 */
async function classifyIntent(message, triggerPrompt, conversationHistory, aiConfig) {
  try {
    const recentHistory = conversationHistory || [];

    // Build a short context window (last 4 turns) so the LLM understands state
    const dialogContext = recentHistory.slice(-4)
      .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n');

    const classificationMessages = [
      {
        role: 'system',
        content: `You are a highly precise lead-capture classification engine.
Your ONLY job: check if the user's latest message matches this exact trigger rule:
"${triggerPrompt}"

STRICT RULES:
1. Respond with ONLY the single word YES if the latest message is a CLEAR, DIRECT match for the trigger rule above.
2. Respond with ONLY the single word NO if the message is a greeting, general question, or does NOT match the trigger rule.
3. Do NOT output anything else — no punctuation, no explanation, no spaces around the word.`,
      },
      {
        role: 'user',
        content: `Conversation context:\n${dialogContext || 'None'}\n\nLatest user message: "${message}"\n\nDoes this match the trigger rule?`,
      },
    ];

    const result = await getAIResponse(classificationMessages, aiConfig);
    const content = result.content?.trim().toUpperCase();
    // Strict equality — "YES, but..." or "I think YES" won't trigger
    return content === 'YES';
  } catch (err) {
    console.error('Intent classification failed:', err);
    return false; // Safe default: don't trigger lead capture on error
  }
}

/**
 * Extracts a clean structured value from a user's raw answer.
 */
async function extractValue(message, questionLabel, questionPrompt, aiConfig) {
  try {
    const extractionMessages = [
      {
        role: 'system',
        content: `You are an AI that extracts information from user messages.
Your task is to extract the answer for "${questionLabel}" from the user's response.
Reply with ONLY the clean extracted value (e.g. just the email, name, or phone number).
If the response doesn't contain a clear value, reply with the raw response. Do not add any explanation.`,
      },
      {
        role: 'user',
        content: `Question asked: "${questionPrompt}"\nUser response: "${message}"`,
      },
    ];

    const result = await getAIResponse(extractionMessages, aiConfig);
    return result.content?.trim() || message;
  } catch (err) {
    console.error('Value extraction failed:', err);
    return message;
  }
}

/**
 * Handles conversational lead collection flow.
 * Returns true if this message was consumed by the lead flow (no further normal chat needed).
 * Returns false if normal AI chat should handle the message.
 */
async function handleLeadCollection(chatbot, conversation, message, res, isStreaming, decryptedConfig, currentSessionId, history) {
  let questions = [];
  try {
    questions = JSON.parse(chatbot.leadQuestions || '[]');
  } catch (e) {
    console.error('Failed to parse lead questions:', e);
  }

  // ── CASE 1: Already in collection mode — process the user's answer ──
  if (conversation.leadStatus === 'collecting') {
    const currentQuestion = questions[conversation.currentQuestionIndex];
    if (!currentQuestion) {
      // Index out of bounds — mark completed and let normal chat continue
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { leadStatus: 'completed', updatedAt: new Date() },
      });
      return false;
    }

    // Extract the value from the user's answer using LLM
    const extractedVal = await extractValue(
      message.trim(),
      currentQuestion.label,
      currentQuestion.question,
      decryptedConfig
    );

    let collected = {};
    try { collected = JSON.parse(conversation.collectedData || '{}'); } catch (e) {}
    collected[currentQuestion.id || currentQuestion.label] = extractedVal;
    const collectedDataStr = JSON.stringify(collected);

    const nextIndex = conversation.currentQuestionIndex + 1;

    if (nextIndex < questions.length) {
      // ── More questions remain — save progress and ask next question ──
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          currentQuestionIndex: nextIndex,
          collectedData: collectedDataStr,
          updatedAt: new Date(),
        },
      });

      // Upsert Lead row progressively so partial data is never lost
      await prisma.lead.upsert({
        where: { conversationId: conversation.id },
        update: { details: collectedDataStr },
        create: { chatbotId: chatbot.id, conversationId: conversation.id, details: collectedDataStr },
      });

      const nextQuestion = questions[nextIndex];
      const assistantMessage = await prisma.message.create({
        data: { role: 'assistant', content: nextQuestion.question, conversationId: conversation.id },
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
          conversationId: conversation.id,
        });
      }
      return true;

    } else {
      // ── All questions answered — finalize lead ──
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { leadStatus: 'completed', collectedData: collectedDataStr, updatedAt: new Date() },
      });

      const lead = await prisma.lead.upsert({
        where: { conversationId: conversation.id },
        update: { details: collectedDataStr },
        create: { chatbotId: chatbot.id, conversationId: conversation.id, details: collectedDataStr },
      });

      // Fire webhook (async, with retry — don't block user response)
      if (chatbot.webhookUrl) {
        triggerWebhook(chatbot.webhookUrl, {
          event: 'lead.captured',
          leadId: lead.id,
          chatbotId: chatbot.id,
          chatbotName: chatbot.name,
          conversationId: conversation.id,
          details: collected,
          createdAt: lead.createdAt,
        }).catch(err => console.error('Webhook fire error:', err));
      }

      // Thank the user with a natural AI-generated response
      const finalPrompt = [
        {
          role: 'system',
          content: `The lead collection is complete. Here are the details collected:\n${Object.entries(collected).map(([k, v]) => `- ${k}: ${v}`).join('\n')}\n\nPolitely thank the user for providing their details and let them know we will get back to them. If they have any other questions, they can ask.`,
        },
        { role: 'user', content: message.trim() },
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
          },
        });

        res.write(`data: ${JSON.stringify({ type: 'done', messageId: assistantMessage.id, tokenCount: aiResult.tokenCount || 0, responseTimeMs })}\n\n`);
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
          },
        });

        res.json({
          reply: aiResult.content,
          sessionId: currentSessionId,
          messageId: assistantMessage.id,
          conversationId: conversation.id,
        });
      }
      return true;
    }
  }

  // ── CASE 2: Not collecting — check if this message should trigger lead capture ──
  if (conversation.leadStatus === 'inactive' && chatbot.leadCollectionEnabled && questions.length > 0) {
    const isLeadIntent = await classifyIntent(
      message.trim(),
      chatbot.leadTriggerPrompt,
      history,          // Pass full conversation history for context
      decryptedConfig
    );

    if (isLeadIntent) {
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { leadStatus: 'collecting', currentQuestionIndex: 0, updatedAt: new Date() },
      });

      const firstQuestion = questions[0];
      const assistantMessage = await prisma.message.create({
        data: { role: 'assistant', content: firstQuestion.question, conversationId: conversation.id },
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
          conversationId: conversation.id,
        });
      }
      return true;
    }
  }

  return false;
}

// POST /api/chat/message - Non-streaming chat
router.post('/message', async (req, res) => {
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

    const { chatbot, conversation, currentSessionId, aiMessages, decryptedConfig, history } = await prepareChat(
      message, sessionId, chatbotId, pageUrl, req.ip
    );

    // Intercept for conversational lead collection
    const leadHandled = await handleLeadCollection(
      chatbot, conversation, message, res, false, decryptedConfig, currentSessionId, history
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

    const { chatbot, conversation, currentSessionId, aiMessages, decryptedConfig, history } = await prepareChat(
      message, sessionId, chatbotId, pageUrl, req.ip
    );

    // Set SSE headers BEFORE any writes (including the lead intercept)
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    // Intercept for conversational lead collection (SSE headers already sent)
    const leadHandled = await handleLeadCollection(
      chatbot, conversation, message, res, true, decryptedConfig, currentSessionId, history
    );
    if (leadHandled) return;

    // Normal streaming AI response
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

    const assistantMessage = await prisma.message.create({
      data: {
        role: 'assistant',
        content: aiResult.content || fullContent,
        tokenCount: aiResult.tokenCount || 0,
        responseTimeMs,
        conversationId: conversation.id,
      },
    });

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
