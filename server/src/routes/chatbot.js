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
      leadCollectionEnabled, leadTriggerPrompt, leadQuestions, webhookUrl, leadStorageOption,
      leadTriggerMode, leadTurnThreshold, leadPhoneFormat, widgetTheme, leadScoringRules
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
        adminId: req.admin.id,
        leadCollectionEnabled: leadCollectionEnabled ?? false,
        leadTriggerPrompt: leadTriggerPrompt || 'When a user asks to buy a service, get a quote, hire us, contact support, or become a lead.',
        leadQuestions: leadQuestions || '[]',
        webhookUrl: webhookUrl || '',
        leadStorageOption: leadStorageOption || 'both',
        leadTriggerMode: leadTriggerMode || 'intent_only',
        leadTurnThreshold: leadTurnThreshold !== undefined ? parseInt(leadTurnThreshold) : 3,
        leadPhoneFormat: leadPhoneFormat || 'IN',
        widgetTheme: widgetTheme || '{}',
        leadScoringRules: leadScoringRules || '{}',
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
      leadCollectionEnabled, leadTriggerPrompt, leadQuestions, webhookUrl, leadStorageOption,
      leadTriggerMode, leadTurnThreshold, leadPhoneFormat, widgetTheme, leadScoringRules,
      ragEnabled, ragProvider, ragApiKey, ragModel
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
        ...(leadCollectionEnabled !== undefined && { leadCollectionEnabled }),
        ...(leadTriggerPrompt !== undefined && { leadTriggerPrompt }),
        ...(leadQuestions !== undefined && { leadQuestions }),
        ...(webhookUrl !== undefined && { webhookUrl }),
        ...(leadStorageOption !== undefined && { leadStorageOption }),
        ...(leadTriggerMode !== undefined && { leadTriggerMode }),
        ...(leadTurnThreshold !== undefined && { leadTurnThreshold: parseInt(leadTurnThreshold) }),
        ...(leadPhoneFormat !== undefined && { leadPhoneFormat }),
        ...(widgetTheme !== undefined && { widgetTheme }),
        ...(leadScoringRules !== undefined && { leadScoringRules }),
        ...(ragEnabled !== undefined && { ragEnabled }),
        ...(ragProvider !== undefined && { ragProvider }),
        ...(ragApiKey !== undefined && { ragApiKey: ragApiKey.includes('****') ? existing.ragApiKey : encrypt(ragApiKey) }),
        ...(ragModel !== undefined && { ragModel }),
      },
      include: { apiConfig: true },
    });

    // Auto rebuild RAG chunks if businessInfo changed and RAG is enabled
    if (businessInfo !== undefined && businessInfo !== existing.businessInfo && chatbot.ragEnabled) {
      const { splitTextIntoChunks, generateEmbedding } = require('../lib/rag');
      const decryptedKey = chatbot.ragApiKey ? decrypt(chatbot.ragApiKey) : null;
      const chunks = splitTextIntoChunks(businessInfo);
      
      if (chunks.length > 0) {
        await prisma.documentChunk.deleteMany({ where: { chatbotId: chatbot.id } });
        for (const chunkObj of chunks) {
          let embeddingStr = '[]';
          if (decryptedKey) {
            try {
              const embeddingVector = await generateEmbedding(chunkObj.content, chatbot.ragProvider, decryptedKey, chatbot.ragModel);
              embeddingStr = JSON.stringify(embeddingVector);
            } catch (e) {
              console.warn(`Auto-embedding generation failed in chatbot update: ${e.message}`);
            }
          }
          await prisma.documentChunk.create({
            data: {
              chatbotId: chatbot.id,
              content: chunkObj.content,
              embedding: embeddingStr,
              chunkIndex: chunkObj.chunkIndex,
              sectionHeading: chunkObj.sectionHeading,
              charStart: chunkObj.charStart,
              charEnd: chunkObj.charEnd
            }
          });
        }
      }
    }

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
