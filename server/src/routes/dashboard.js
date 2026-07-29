const express = require('express');
const prisma = require('../lib/prisma');
const { authMiddleware } = require('../lib/auth');

const router = express.Router();
router.use(authMiddleware);

// GET /api/dashboard/overview - Global stats across all chatbots
router.get('/overview', async (req, res) => {
  try {
    const adminId = req.admin.id;

    // Get all chatbot IDs for this admin
    const chatbots = await prisma.chatbot.findMany({
      where: { adminId },
      select: { id: true, name: true, isActive: true, createdAt: true },
    });
    const chatbotIds = chatbots.map(c => c.id);

    if (chatbotIds.length === 0) {
      return res.json({
        chatbotCount: 0,
        totalConversations: 0,
        totalMessages: 0,
        todayMessages: 0,
        avgResponseTime: 0,
        totalTokens: 0,
        chatbots: [],
      });
    }

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const [totalConversations, totalMessages, todayMessages, avgResponseTime, totalTokens] = await Promise.all([
      prisma.conversation.count({ where: { chatbotId: { in: chatbotIds } } }),
      prisma.message.count({ where: { conversation: { chatbotId: { in: chatbotIds } } } }),
      prisma.message.count({ where: { createdAt: { gte: today }, conversation: { chatbotId: { in: chatbotIds } } } }),
      prisma.message.aggregate({
        where: { role: 'assistant', responseTimeMs: { gt: 0 }, conversation: { chatbotId: { in: chatbotIds } } },
        _avg: { responseTimeMs: true },
      }),
      prisma.message.aggregate({
        where: { role: 'assistant', conversation: { chatbotId: { in: chatbotIds } } },
        _sum: { tokenCount: true },
      }),
    ]);

    // Per-chatbot summary
    const chatbotSummaries = await Promise.all(chatbots.map(async (bot) => {
      const [convCount, msgCount] = await Promise.all([
        prisma.conversation.count({ where: { chatbotId: bot.id } }),
        prisma.message.count({ where: { conversation: { chatbotId: bot.id } } }),
      ]);
      return { ...bot, conversations: convCount, messages: msgCount };
    }));

    res.json({
      chatbotCount: chatbots.length,
      totalConversations,
      totalMessages,
      todayMessages,
      avgResponseTime: Math.round(avgResponseTime._avg.responseTimeMs || 0),
      totalTokens: totalTokens._sum.tokenCount || 0,
      chatbots: chatbotSummaries,
    });
  } catch (error) {
    console.error('Dashboard overview error:', error);
    res.status(500).json({ error: 'Failed to get overview' });
  }
});

// GET /api/dashboard/stats/:chatbotId - Per-bot statistics
router.get('/stats/:chatbotId', async (req, res) => {
  try {
    const { chatbotId } = req.params;

    // Verify ownership
    const chatbot = await prisma.chatbot.findFirst({
      where: { id: chatbotId, adminId: req.admin.id },
    });
    if (!chatbot) return res.status(404).json({ error: 'Chatbot not found' });

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const thisWeek = new Date(today);
    thisWeek.setDate(thisWeek.getDate() - 7);

    const [totalConversations, totalMessages, todayConversations, todayMessages, weekConversations, activeConversations, avgResponseTime, totalTokens] = await Promise.all([
      prisma.conversation.count({ where: { chatbotId } }),
      prisma.message.count({ where: { conversation: { chatbotId } } }),
      prisma.conversation.count({ where: { chatbotId, createdAt: { gte: today } } }),
      prisma.message.count({ where: { createdAt: { gte: today }, conversation: { chatbotId } } }),
      prisma.conversation.count({ where: { chatbotId, createdAt: { gte: thisWeek } } }),
      prisma.conversation.count({ where: { chatbotId, status: 'active' } }),
      prisma.message.aggregate({
        where: { role: 'assistant', responseTimeMs: { gt: 0 }, conversation: { chatbotId } },
        _avg: { responseTimeMs: true },
      }),
      prisma.message.aggregate({
        where: { role: 'assistant', conversation: { chatbotId } },
        _sum: { tokenCount: true },
      }),
    ]);

    res.json({
      totalConversations,
      totalMessages,
      todayConversations,
      todayMessages,
      weekConversations,
      activeConversations,
      avgResponseTime: Math.round(avgResponseTime._avg.responseTimeMs || 0),
      totalTokens: totalTokens._sum.tokenCount || 0,
    });
  } catch (error) {
    console.error('Bot stats error:', error);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

// GET /api/dashboard/chart/:chatbotId/messages - Optimized with SQL GROUP BY
router.get('/chart/:chatbotId/messages', async (req, res) => {
  try {
    const { chatbotId } = req.params;
    const days = parseInt(req.query.days) || 30;

    const chatbot = await prisma.chatbot.findFirst({
      where: { id: chatbotId, adminId: req.admin.id },
    });
    if (!chatbot) return res.status(404).json({ error: 'Chatbot not found' });

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Optimized SQL query - GROUP BY date instead of fetching all records
    const rawData = await prisma.$queryRaw`
      SELECT
        DATE(m."createdAt") as date,
        COUNT(CASE WHEN m."role" = 'user' THEN 1 END)::int as "userMessages",
        COUNT(CASE WHEN m."role" = 'assistant' THEN 1 END)::int as "botMessages",
        COUNT(*)::int as total
      FROM "Message" m
      JOIN "Conversation" c ON m."conversationId" = c."id"
      WHERE c."chatbotId" = ${chatbotId}
        AND m."createdAt" >= ${startDate}
      GROUP BY DATE(m."createdAt")
      ORDER BY date ASC
    `;

    // Fill in missing dates
    const dataMap = {};
    rawData.forEach(row => {
      const key = row.date.toISOString().split('T')[0];
      dataMap[key] = { date: key, userMessages: row.userMessages, botMessages: row.botMessages, total: row.total };
    });

    const result = [];
    for (let i = 0; i < days; i++) {
      const date = new Date();
      date.setDate(date.getDate() - (days - 1 - i));
      const key = date.toISOString().split('T')[0];
      result.push(dataMap[key] || { date: key, userMessages: 0, botMessages: 0, total: 0 });
    }

    res.json(result);
  } catch (error) {
    console.error('Chart messages error:', error);
    res.status(500).json({ error: 'Failed to get chart data' });
  }
});

// GET /api/dashboard/chart/:chatbotId/conversations - Optimized
router.get('/chart/:chatbotId/conversations', async (req, res) => {
  try {
    const { chatbotId } = req.params;
    const days = parseInt(req.query.days) || 30;

    const chatbot = await prisma.chatbot.findFirst({
      where: { id: chatbotId, adminId: req.admin.id },
    });
    if (!chatbot) return res.status(404).json({ error: 'Chatbot not found' });

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const rawData = await prisma.$queryRaw`
      SELECT
        DATE("createdAt") as date,
        COUNT(*)::int as conversations
      FROM "Conversation"
      WHERE "chatbotId" = ${chatbotId}
        AND "createdAt" >= ${startDate}
      GROUP BY DATE("createdAt")
      ORDER BY date ASC
    `;

    const dataMap = {};
    rawData.forEach(row => {
      const key = row.date.toISOString().split('T')[0];
      dataMap[key] = { date: key, conversations: row.conversations };
    });

    const result = [];
    for (let i = 0; i < days; i++) {
      const date = new Date();
      date.setDate(date.getDate() - (days - 1 - i));
      const key = date.toISOString().split('T')[0];
      result.push(dataMap[key] || { date: key, conversations: 0 });
    }

    res.json(result);
  } catch (error) {
    console.error('Chart conversations error:', error);
    res.status(500).json({ error: 'Failed to get chart data' });
  }
});

// GET /api/dashboard/chart/:chatbotId/response-times - Optimized
router.get('/chart/:chatbotId/response-times', async (req, res) => {
  try {
    const { chatbotId } = req.params;
    const days = parseInt(req.query.days) || 30;

    const chatbot = await prisma.chatbot.findFirst({
      where: { id: chatbotId, adminId: req.admin.id },
    });
    if (!chatbot) return res.status(404).json({ error: 'Chatbot not found' });

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const rawData = await prisma.$queryRaw`
      SELECT
        DATE(m."createdAt") as date,
        ROUND(AVG(m."responseTimeMs"))::int as "avgResponseTime"
      FROM "Message" m
      JOIN "Conversation" c ON m."conversationId" = c."id"
      WHERE c."chatbotId" = ${chatbotId}
        AND m."role" = 'assistant'
        AND m."responseTimeMs" > 0
        AND m."createdAt" >= ${startDate}
      GROUP BY DATE(m."createdAt")
      ORDER BY date ASC
    `;

    const dataMap = {};
    rawData.forEach(row => {
      const key = row.date.toISOString().split('T')[0];
      dataMap[key] = { date: key, avgResponseTime: row.avgResponseTime };
    });

    const result = [];
    for (let i = 0; i < days; i++) {
      const date = new Date();
      date.setDate(date.getDate() - (days - 1 - i));
      const key = date.toISOString().split('T')[0];
      result.push(dataMap[key] || { date: key, avgResponseTime: 0 });
    }

    res.json(result);
  } catch (error) {
    console.error('Chart response times error:', error);
    res.status(500).json({ error: 'Failed to get chart data' });
  }
});

// GET /api/dashboard/recent/:chatbotId - Recent conversations for a bot
router.get('/recent/:chatbotId', async (req, res) => {
  try {
    const { chatbotId } = req.params;

    const chatbot = await prisma.chatbot.findFirst({
      where: { id: chatbotId, adminId: req.admin.id },
    });
    if (!chatbot) return res.status(404).json({ error: 'Chatbot not found' });

    const conversations = await prisma.conversation.findMany({
      where: { chatbotId },
      include: {
        messages: { orderBy: { createdAt: 'desc' }, take: 2 },
        _count: { select: { messages: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 10,
    });

    res.json(conversations);
  } catch (error) {
    console.error('Recent conversations error:', error);
    res.status(500).json({ error: 'Failed to get recent conversations' });
  }
});

module.exports = router;
