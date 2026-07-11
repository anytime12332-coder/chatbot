const express = require('express');
const prisma = require('../lib/prisma');
const { authMiddleware } = require('../lib/auth');
const { PROVIDER_CONFIGS } = require('../lib/aiProviders');
const { encrypt, decrypt, maskApiKey } = require('../lib/encryption');

const router = express.Router();
router.use(authMiddleware);

// GET /api/api-config/providers
router.get('/providers', async (req, res) => {
  const providers = Object.entries(PROVIDER_CONFIGS).map(([key, config]) => ({
    id: key,
    name: key.charAt(0).toUpperCase() + key.slice(1),
    models: config.models,
    defaultModel: config.defaultModel,
    requiresBaseUrl: key === 'custom',
    supportsStreaming: config.supportsStreaming,
  }));
  res.json(providers);
});

// PUT /api/api-config/:chatbotId - Update API config for a specific chatbot
router.put('/:chatbotId', async (req, res) => {
  try {
    const { chatbotId } = req.params;

    // Verify ownership
    const chatbot = await prisma.chatbot.findFirst({
      where: { id: chatbotId, adminId: req.admin.id },
    });
    if (!chatbot) {
      return res.status(404).json({ error: 'Chatbot not found' });
    }

    const { provider, apiKey, model, baseUrl, maxTokens, temperature } = req.body;

    const updateData = {};
    if (provider !== undefined) updateData.provider = provider;
    if (apiKey !== undefined && apiKey !== '' && !apiKey.includes('****')) {
      updateData.apiKey = encrypt(apiKey);
    }
    if (model !== undefined) updateData.model = model;
    if (baseUrl !== undefined) updateData.baseUrl = baseUrl;
    if (maxTokens !== undefined) updateData.maxTokens = parseInt(maxTokens);
    if (temperature !== undefined) updateData.temperature = parseFloat(temperature);

    let apiConfig = await prisma.apiConfig.findUnique({
      where: { chatbotId },
    });

    if (apiConfig) {
      apiConfig = await prisma.apiConfig.update({
        where: { id: apiConfig.id },
        data: updateData,
      });
    } else {
      apiConfig = await prisma.apiConfig.create({
        data: { ...updateData, chatbotId },
      });
    }

    apiConfig.apiKey = maskApiKey(decrypt(apiConfig.apiKey));
    res.json(apiConfig);
  } catch (error) {
    console.error('Update API config error:', error);
    res.status(500).json({ error: 'Failed to update API config' });
  }
});

// POST /api/api-config/:chatbotId/test - Test API connection
router.post('/:chatbotId/test', async (req, res) => {
  try {
    const { getAIResponse } = require('../lib/aiProviders');
    const { chatbotId } = req.params;

    const chatbot = await prisma.chatbot.findFirst({
      where: { id: chatbotId, adminId: req.admin.id },
      include: { apiConfig: true },
    });

    if (!chatbot?.apiConfig?.apiKey) {
      return res.status(400).json({ error: 'No API key configured' });
    }

    // Decrypt API key for the call
    const decryptedConfig = {
      ...chatbot.apiConfig,
      apiKey: decrypt(chatbot.apiConfig.apiKey),
    };

    const startTime = Date.now();
    const result = await getAIResponse(
      [{ role: 'user', content: 'Say "Connection successful!" in exactly those words.' }],
      decryptedConfig
    );
    const responseTime = Date.now() - startTime;

    res.json({
      success: true,
      message: result.content,
      responseTimeMs: responseTime,
      provider: chatbot.apiConfig.provider,
      model: chatbot.apiConfig.model,
    });
  } catch (error) {
    console.error('API test error:', error);
    res.status(400).json({ success: false, error: error.message || 'Connection test failed' });
  }
});

module.exports = router;
