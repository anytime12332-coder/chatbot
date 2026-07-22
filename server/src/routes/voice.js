const express = require('express');
const prisma = require('../lib/prisma');
const { authMiddleware } = require('../lib/auth');
const { encrypt, decrypt } = require('../lib/encryption');
const https = require('https');

const router = express.Router();

// GET /api/voice/:botId - Get voice config for a chatbot
router.get('/:botId', authMiddleware, async (req, res) => {
  try {
    const chatbot = await prisma.chatbot.findFirst({
      where: { id: req.params.botId, adminId: req.admin.id },
      select: { id: true, voiceConfig: true },
    });

    if (!chatbot) return res.status(404).json({ error: 'Chatbot not found' });

    let parsedConfig = {
      enabled: false,
      provider: 'browser', // 'browser' | 'deepgram' | 'whisper'
      apiKey: '',
      model: 'nova-2',
      autoSend: false,
      language: 'en-US',
    };

    try {
      if (chatbot.voiceConfig) {
        const stored = JSON.parse(chatbot.voiceConfig);
        parsedConfig = {
          ...parsedConfig,
          ...stored,
          apiKey: stored.apiKey ? decrypt(stored.apiKey) : '',
        };
      }
    } catch (e) {
      console.error('Error parsing voiceConfig:', e);
    }

    const hasApiKey = Boolean(parsedConfig.apiKey);
    const maskedConfig = {
      ...parsedConfig,
      apiKey: hasApiKey ? '••••••••' + parsedConfig.apiKey.slice(-4) : '',
      hasApiKey,
    };

    res.json(maskedConfig);
  } catch (error) {
    console.error('Get voice config error:', error);
    res.status(500).json({ error: 'Failed to fetch voice configuration' });
  }
});

// PUT /api/voice/:botId - Update voice config for a chatbot
router.put('/:botId', authMiddleware, async (req, res) => {
  try {
    const { enabled, provider, apiKey, model, autoSend, language } = req.body;

    const chatbot = await prisma.chatbot.findFirst({
      where: { id: req.params.botId, adminId: req.admin.id },
    });

    if (!chatbot) return res.status(404).json({ error: 'Chatbot not found' });

    let currentStored = {};
    try {
      if (chatbot.voiceConfig) currentStored = JSON.parse(chatbot.voiceConfig);
    } catch (_) {}

    let keyToStore = currentStored.apiKey || '';
    if (apiKey && !apiKey.startsWith('••••')) {
      keyToStore = encrypt(apiKey.trim());
    }

    const updatedConfig = {
      enabled: Boolean(enabled),
      provider: provider || 'browser',
      apiKey: keyToStore,
      model: model || 'nova-2',
      autoSend: Boolean(autoSend),
      language: language || 'en-US',
      updatedAt: new Date().toISOString(),
    };

    await prisma.chatbot.update({
      where: { id: req.params.botId },
      data: { voiceConfig: JSON.stringify(updatedConfig) },
    });

    res.json({
      success: true,
      message: 'Voice configuration updated successfully!',
      config: {
        ...updatedConfig,
        apiKey: apiKey && !apiKey.startsWith('••••') ? '••••••••' + apiKey.slice(-4) : (currentStored.apiKey ? '••••' : ''),
        hasApiKey: Boolean(keyToStore),
      },
    });
  } catch (error) {
    console.error('Update voice config error:', error);
    res.status(500).json({ error: 'Failed to save voice configuration' });
  }
});

// POST /api/voice/:botId/test - Test voice provider API connection
router.post('/:botId/test', authMiddleware, async (req, res) => {
  try {
    const { provider, apiKey, model } = req.body;

    let keyToTest = apiKey;

    if (!keyToTest || keyToTest.startsWith('••••')) {
      const chatbot = await prisma.chatbot.findFirst({
        where: { id: req.params.botId, adminId: req.admin.id },
        select: { voiceConfig: true },
      });
      if (chatbot?.voiceConfig) {
        const stored = JSON.parse(chatbot.voiceConfig);
        keyToTest = stored.apiKey ? decrypt(stored.apiKey) : '';
      }
    }

    if (provider === 'browser') {
      return res.json({
        success: true,
        provider: 'browser',
        message: 'Browser Web Speech API is built into Chrome/Edge/Safari (zero key needed).',
      });
    }

    if (!keyToTest) {
      return res.status(400).json({ success: false, error: 'API key is required for testing ' + provider });
    }

    if (provider === 'deepgram') {
      // Test Deepgram connection by checking projects endpoint
      return new Promise((resolve) => {
        const req = https.request({
          hostname: 'api.deepgram.com',
          path: '/v1/projects',
          method: 'GET',
          headers: {
            'Authorization': `Token ${keyToTest}`,
            'User-Agent': 'SLSO-Chatbot-Voice/1.0',
          },
          timeout: 10000,
        }, (resObj) => {
          let data = '';
          resObj.on('data', chunk => data += chunk);
          resObj.on('end', () => {
            if (resObj.statusCode >= 200 && resObj.statusCode < 300) {
              res.json({
                success: true,
                provider: 'deepgram',
                model: model || 'nova-2',
                message: 'Successfully authenticated with Deepgram API!',
              });
            } else {
              res.json({
                success: false,
                provider: 'deepgram',
                error: `Deepgram API returned HTTP ${resObj.statusCode}: ${data.slice(0, 200)}`,
              });
            }
          });
        });

        req.on('error', (err) => {
          res.json({ success: false, provider: 'deepgram', error: `Network error: ${err.message}` });
        });
        req.end();
      });
    } else if (provider === 'whisper') {
      // Test OpenAI Whisper connection by checking models endpoint
      return new Promise((resolve) => {
        const req = https.request({
          hostname: 'api.openai.com',
          path: '/v1/models/whisper-1',
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${keyToTest}`,
          },
          timeout: 10000,
        }, (resObj) => {
          let data = '';
          resObj.on('data', chunk => data += chunk);
          resObj.on('end', () => {
            if (resObj.statusCode >= 200 && resObj.statusCode < 300) {
              res.json({
                success: true,
                provider: 'whisper',
                model: 'whisper-1',
                message: 'Successfully authenticated with OpenAI Whisper API!',
              });
            } else {
              res.json({
                success: false,
                provider: 'whisper',
                error: `OpenAI API returned HTTP ${resObj.statusCode}: ${data.slice(0, 200)}`,
              });
            }
          });
        });

        req.on('error', (err) => {
          res.json({ success: false, provider: 'whisper', error: `Network error: ${err.message}` });
        });
        req.end();
      });
    } else {
      return res.status(400).json({ success: false, error: 'Unsupported voice provider: ' + provider });
    }
  } catch (error) {
    console.error('Test voice connection error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/voice/transcribe - Transcribe audio buffer (for Deepgram/Whisper server relay if needed)
router.post('/transcribe', async (req, res) => {
  try {
    const { audioBase64, mimeType, botId, provider: reqProvider } = req.body;

    if (!audioBase64 || !botId) {
      return res.status(400).json({ error: 'audioBase64 and botId are required' });
    }

    const chatbot = await prisma.chatbot.findUnique({
      where: { id: botId },
      select: { voiceConfig: true },
    });

    let config = { provider: 'browser', apiKey: '', model: 'nova-2' };
    try {
      if (chatbot?.voiceConfig) {
        const parsed = JSON.parse(chatbot.voiceConfig);
        config = {
          ...config,
          ...parsed,
          apiKey: parsed.apiKey ? decrypt(parsed.apiKey) : '',
        };
      }
    } catch (_) {}

    const provider = reqProvider || config.provider;

    if (provider === 'deepgram' && config.apiKey) {
      const audioBuffer = Buffer.from(audioBase64.replace(/^data:audio\/\w+;base64,/, ''), 'base64');
      const contentType = mimeType || 'audio/webm';

      return new Promise((resolve) => {
        const req = https.request({
          hostname: 'api.deepgram.com',
          path: `/v1/listen?model=${encodeURIComponent(config.model || 'nova-2')}&smart_formatting=true&punctuate=true`,
          method: 'POST',
          headers: {
            'Authorization': `Token ${config.apiKey}`,
            'Content-Type': contentType,
            'Content-Length': audioBuffer.length,
          },
          timeout: 15000,
        }, (resObj) => {
          let data = '';
          resObj.on('data', chunk => data += chunk);
          resObj.on('end', () => {
            try {
              const parsed = JSON.parse(data);
              const transcript = parsed.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
              res.json({ transcript: transcript.trim(), provider: 'deepgram' });
            } catch (e) {
              res.status(500).json({ error: 'Failed to parse Deepgram response' });
            }
          });
        });

        req.on('error', (err) => {
          res.status(500).json({ error: `Deepgram API request failed: ${err.message}` });
        });

        req.write(audioBuffer);
        req.end();
      });
    }

    // Fallback
    res.json({ transcript: '', message: 'Use browser speech recognition or configure Deepgram API key' });
  } catch (error) {
    console.error('Transcribe error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
