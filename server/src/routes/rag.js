const express = require('express');
const prisma = require('../lib/prisma');
const { authMiddleware } = require('../lib/auth');
const { encrypt, decrypt, maskApiKey } = require('../lib/encryption');
const { splitTextIntoChunks, generateEmbedding } = require('../lib/rag');

const router = express.Router();
router.use(authMiddleware);

// GET /api/rag/:botId - Get RAG configuration and chunks count
router.get('/:botId', async (req, res) => {
  try {
    const { botId } = req.params;

    const chatbot = await prisma.chatbot.findFirst({
      where: { id: botId, adminId: req.admin.id },
      select: {
        id: true,
        name: true,
        businessInfo: true,
        ragEnabled: true,
        ragProvider: true,
        ragApiKey: true,
        ragModel: true
      }
    });

    if (!chatbot) return res.status(404).json({ error: 'Chatbot not found' });

    // Count chunks
    const chunkCount = await prisma.documentChunk.count({
      where: { chatbotId: botId }
    });

    // Get a sample of chunks (top 5) for preview
    const sampleChunks = await prisma.documentChunk.findMany({
      where: { chatbotId: botId },
      take: 5,
      select: { id: true, content: true, createdAt: true }
    });

    // Mask key
    const maskedKey = chatbot.ragApiKey ? maskApiKey(decrypt(chatbot.ragApiKey)) : '';

    res.json({
      ...chatbot,
      ragApiKey: maskedKey,
      hasApiKey: !!chatbot.ragApiKey,
      chunkCount,
      sampleChunks
    });
  } catch (error) {
    console.error('Get RAG config error:', error);
    res.status(500).json({ error: 'Failed to retrieve RAG configuration' });
  }
});

// POST /api/rag/:botId/test - Test Embedding API Connection
router.post('/:botId/test', async (req, res) => {
  try {
    const { botId } = req.params;
    const { provider, apiKey, model } = req.body;

    if (!apiKey) return res.status(400).json({ error: 'API key is required' });

    // Validate connection by making a dummy embedding call
    const testText = 'RAG API Connection Test';
    const result = await generateEmbedding(testText, provider, apiKey, model);

    if (result && Array.isArray(result) && result.length > 0) {
      res.json({ success: true, vectorLength: result.length });
    } else {
      res.status(502).json({ error: 'Invalid API response format returned' });
    }
  } catch (error) {
    console.error('RAG test embedding failed:', error);
    res.status(500).json({ error: error.message || 'Failed to connect to embedding provider' });
  }
});

// POST /api/rag/:botId/rebuild - Force rebuild chunks and embeddings
router.post('/:botId/rebuild', async (req, res) => {
  try {
    const { botId } = req.params;

    const chatbot = await prisma.chatbot.findFirst({
      where: { id: botId, adminId: req.admin.id }
    });
    if (!chatbot) return res.status(404).json({ error: 'Chatbot not found' });
    if (!chatbot.businessInfo) {
      return res.status(400).json({ error: 'Business Information is empty. Provide text first.' });
    }

    const decryptedKey = chatbot.ragApiKey ? decrypt(chatbot.ragApiKey) : null;
    const chunks = splitTextIntoChunks(chatbot.businessInfo);

    if (chunks.length === 0) {
      return res.status(400).json({ error: 'No text chunks generated.' });
    }

    // Delete existing chunks
    await prisma.documentChunk.deleteMany({
      where: { chatbotId: botId }
    });

    // If RAG is enabled, query embeddings and save
    const savedChunks = [];
    for (const chunkObj of chunks) {
      let embeddingStr = '[]';
      if (chatbot.ragEnabled && decryptedKey) {
        try {
          const embeddingVector = await generateEmbedding(chunkObj.content, chatbot.ragProvider, decryptedKey, chatbot.ragModel);
          embeddingStr = JSON.stringify(embeddingVector);
        } catch (e) {
          console.warn(`Failed to generate embedding for chunk: ${e.message}. Saving without embedding.`);
        }
      }
      
      const newChunk = await prisma.documentChunk.create({
        data: {
          chatbotId: botId,
          content: chunkObj.content,
          embedding: embeddingStr,
          chunkIndex: chunkObj.chunkIndex,
          sectionHeading: chunkObj.sectionHeading,
          charStart: chunkObj.charStart,
          charEnd: chunkObj.charEnd
        }
      });
      savedChunks.push(newChunk);
    }

    res.json({ success: true, chunksCount: savedChunks.length });
  } catch (error) {
    console.error('Rebuild RAG error:', error);
    res.status(500).json({ error: error.message || 'Failed to rebuild RAG database' });
  }
});

// PUT /api/rag/:botId - Save config and rebuild
router.put('/:botId', async (req, res) => {
  try {
    const { botId } = req.params;
    const { ragEnabled, ragProvider, ragApiKey, ragModel, businessInfo } = req.body;

    const chatbot = await prisma.chatbot.findFirst({
      where: { id: botId, adminId: req.admin.id }
    });
    if (!chatbot) return res.status(404).json({ error: 'Chatbot not found' });

    let updatedApiKey = chatbot.ragApiKey;
    if (ragApiKey !== undefined) {
      if (ragApiKey.trim() === '') {
        updatedApiKey = '';
      } else if (!ragApiKey.includes('****')) {
        updatedApiKey = encrypt(ragApiKey.trim());
      }
    }

    // Save configurations
    const updated = await prisma.chatbot.update({
      where: { id: botId },
      data: {
        ragEnabled: ragEnabled ?? chatbot.ragEnabled,
        ragProvider: ragProvider || chatbot.ragProvider,
        ragApiKey: updatedApiKey,
        ragModel: ragModel || chatbot.ragModel,
        ...(businessInfo !== undefined && { businessInfo })
      }
    });

    // Auto rebuild if RAG was just turned on or credentials updated
    const isNowEnabled = ragEnabled && !chatbot.ragEnabled;
    const keyChanged = updatedApiKey !== chatbot.ragApiKey && updatedApiKey !== '';
    
    if ((isNowEnabled || keyChanged) && chatbot.businessInfo) {
      const decryptedKey = updatedApiKey ? decrypt(updatedApiKey) : null;
      const chunks = splitTextIntoChunks(chatbot.businessInfo);
      
      if (chunks.length > 0) {
        await prisma.documentChunk.deleteMany({ where: { chatbotId: botId } });
        
        for (const chunkObj of chunks) {
          let embeddingStr = '[]';
          if (decryptedKey) {
            try {
              const embeddingVector = await generateEmbedding(chunkObj.content, updated.ragProvider, decryptedKey, updated.ragModel);
              embeddingStr = JSON.stringify(embeddingVector);
            } catch (e) {
              console.warn(`Auto-embedding generation failed: ${e.message}`);
            }
          }
          await prisma.documentChunk.create({
            data: {
              chatbotId: botId,
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

    // Count chunks
    const chunkCount = await prisma.documentChunk.count({
      where: { chatbotId: botId }
    });

    res.json({
      success: true,
      ragEnabled: updated.ragEnabled,
      ragProvider: updated.ragProvider,
      ragModel: updated.ragModel,
      chunkCount
    });
  } catch (error) {
    console.error('Update RAG config error:', error);
    res.status(500).json({ error: 'Failed to update RAG configuration' });
  }
});

// GET /api/rag/chunks/:botId - Get raw chunks for inspection
router.get('/chunks/:botId', async (req, res) => {
  try {
    const { botId } = req.params;
    const chatbot = await prisma.chatbot.findFirst({
      where: { id: botId, adminId: req.admin.id }
    });
    if (!chatbot) return res.status(404).json({ error: 'Chatbot not found' });

    const chunks = await prisma.documentChunk.findMany({
      where: { chatbotId: botId },
      orderBy: { chunkIndex: 'asc' },
      select: {
        id: true,
        chunkIndex: true,
        content: true,
        sectionHeading: true,
        charStart: true,
        charEnd: true,
        createdAt: true
      }
    });

    res.json(chunks);
  } catch (error) {
    console.error('Get chunks error:', error);
    res.status(500).json({ error: 'Failed to retrieve chunks' });
  }
});

module.exports = router;
