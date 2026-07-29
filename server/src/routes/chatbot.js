const express = require('express');
const prisma = require('../lib/prisma');
const { authMiddleware } = require('../lib/auth');
const { maskApiKey } = require('../lib/encryption');
const { decrypt } = require('../lib/encryption');

const router = express.Router();
router.use(authMiddleware);

// GET /api/chatbots - List all chatbots for current admin
router.get('/', async (req, res) => {
  try {
    const chatbots = await prisma.chatbot.findMany({
      where: { adminId: req.admin.id },
      include: {
        apiConfig: true,
        _count: { select: { conversations: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Mask API keys and get message counts
    const result = await Promise.all(chatbots.map(async (bot) => {
      const messageCount = await prisma.message.count({
        where: { conversation: { chatbotId: bot.id } },
      });

      return {
        ...bot,
        messageCount,
        apiConfig: bot.apiConfig ? {
          ...bot.apiConfig,
          apiKey: maskApiKey(decrypt(bot.apiConfig.apiKey)),
        } : null,
      };
    }));

    res.json(result);
  } catch (error) {
    console.error('List chatbots error:', error);
    res.status(500).json({ error: 'Failed to list chatbots' });
  }
});

// POST /api/chatbots - Create a new chatbot
router.post('/', async (req, res) => {
  try {
    const {
      name, businessName, businessInfo, systemPrompt, welcomeMessage, primaryColor, position,
      statusText, avatarIcon, avatarUrl, placeholderText, launcherText, theme, fontSize, borderRadius, starterPrompts, hideBranding,
    } = req.body;

    const chatbot = await prisma.chatbot.create({
      data: {
        name: name || 'New Chatbot',
        businessName: businessName || '',
        businessInfo: businessInfo || '',
        systemPrompt: systemPrompt || 'You are a helpful assistant.',
        welcomeMessage: welcomeMessage || 'Hello! How can I help you today?',
        primaryColor: primaryColor || '#6366f1',
        position: position || 'bottom-right',
        statusText: statusText || 'Online',
        avatarIcon: avatarIcon || 'bot',
        avatarUrl: avatarUrl || '',
        placeholderText: placeholderText || 'Type a message...',
        launcherText: launcherText || '',
        theme: theme || 'light',
        fontSize: fontSize || 'medium',
        borderRadius: borderRadius || '18px',
        starterPrompts: starterPrompts || '',
        hideBranding: hideBranding ?? false,
        adminId: req.admin.id,
        apiConfig: {
          create: {
            provider: 'openai',
            model: 'gpt-3.5-turbo',
            maxTokens: 1024,
            temperature: 0.7,
          },
        },
      },
      include: { apiConfig: true },
    });

    res.status(201).json(chatbot);
  } catch (error) {
    console.error('Create chatbot error:', error);
    res.status(500).json({ error: 'Failed to create chatbot' });
  }
});

// GET /api/chatbots/:id - Get single chatbot
router.get('/:id', async (req, res) => {
  try {
    const chatbot = await prisma.chatbot.findFirst({
      where: { id: req.params.id, adminId: req.admin.id },
      include: { apiConfig: true },
    });

    if (!chatbot) {
      return res.status(404).json({ error: 'Chatbot not found' });
    }

    if (chatbot.apiConfig?.apiKey) {
      chatbot.apiConfig.apiKey = maskApiKey(decrypt(chatbot.apiConfig.apiKey));
    }

    res.json(chatbot);
  } catch (error) {
    console.error('Get chatbot error:', error);
    res.status(500).json({ error: 'Failed to get chatbot' });
  }
});

// PUT /api/chatbots/:id - Update chatbot
router.put('/:id', async (req, res) => {
  try {
    const existing = await prisma.chatbot.findFirst({
      where: { id: req.params.id, adminId: req.admin.id },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Chatbot not found' });
    }

    const {
      name, businessName, businessInfo, systemPrompt, welcomeMessage, primaryColor, position, isActive,
      statusText, avatarIcon, avatarUrl, placeholderText, launcherText, theme, fontSize, borderRadius, starterPrompts, hideBranding,
    } = req.body;

    const chatbot = await prisma.chatbot.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined && { name }),
        ...(businessName !== undefined && { businessName }),
        ...(businessInfo !== undefined && { businessInfo }),
        ...(systemPrompt !== undefined && { systemPrompt }),
        ...(welcomeMessage !== undefined && { welcomeMessage }),
        ...(primaryColor !== undefined && { primaryColor }),
        ...(position !== undefined && { position }),
        ...(isActive !== undefined && { isActive }),
        ...(statusText !== undefined && { statusText }),
        ...(avatarIcon !== undefined && { avatarIcon }),
        ...(avatarUrl !== undefined && { avatarUrl }),
        ...(placeholderText !== undefined && { placeholderText }),
        ...(launcherText !== undefined && { launcherText }),
        ...(theme !== undefined && { theme }),
        ...(fontSize !== undefined && { fontSize }),
        ...(borderRadius !== undefined && { borderRadius }),
        ...(starterPrompts !== undefined && { starterPrompts }),
        ...(hideBranding !== undefined && { hideBranding }),
      },
      include: { apiConfig: true },
    });

    if (chatbot.apiConfig?.apiKey) {
      chatbot.apiConfig.apiKey = maskApiKey(decrypt(chatbot.apiConfig.apiKey));
    }

    res.json(chatbot);
  } catch (error) {
    console.error('Update chatbot error:', error);
    res.status(500).json({ error: 'Failed to update chatbot' });
  }
});

// DELETE /api/chatbots/:id - Delete chatbot and all its data
router.delete('/:id', async (req, res) => {
  try {
    const existing = await prisma.chatbot.findFirst({
      where: { id: req.params.id, adminId: req.admin.id },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Chatbot not found' });
    }

    await prisma.chatbot.delete({ where: { id: req.params.id } });
    res.json({ message: 'Chatbot deleted successfully' });
  } catch (error) {
    console.error('Delete chatbot error:', error);
    res.status(500).json({ error: 'Failed to delete chatbot' });
  }
});

module.exports = router;
