const express = require('express');
const prisma = require('../lib/prisma');
const { getAIResponse, getAIResponseStreaming } = require('../lib/aiProviders');
const { decrypt } = require('../lib/encryption');
const { aiQueue } = require('../lib/queue');
const { v4: uuidv4 } = require('uuid');
const { authMiddleware } = require('../lib/auth');

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
      messages: { orderBy: { createdAt: 'asc' }, take: 20 },
    },
  });

  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: { sessionId: currentSessionId, chatbotId, visitorIp: ip || '', pageUrl: pageUrl || '' },
      include: { messages: true },
    });
  }

  // Save user message
  await prisma.message.create({
    data: { role: 'user', content: message.trim(), conversationId: conversation.id },
  });

  // Build AI messages
  const aiMessages = [
    { role: 'system', content: buildSystemPrompt(chatbot) },
    ...conversation.messages.map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: message.trim() },
  ];

  // Decrypt API key
  const decryptedConfig = {
    ...chatbot.apiConfig,
    apiKey: decrypt(chatbot.apiConfig.apiKey),
  };

  return { chatbot, conversation, currentSessionId, aiMessages, decryptedConfig };
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

    const { conversation, currentSessionId, aiMessages, decryptedConfig } = await prepareChat(
      message, sessionId, chatbotId, pageUrl, req.ip
    );

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

    const { conversation, currentSessionId, aiMessages, decryptedConfig } = await prepareChat(
      message, sessionId, chatbotId, pageUrl, req.ip
    );

    // Set up SSE
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

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
        chatbot: { select: { adminId: true, name: true } },
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
