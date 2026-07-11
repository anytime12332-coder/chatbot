const https = require('https');
const http = require('http');
const prisma = require('./prisma');
const { decrypt } = require('./encryption');

/**
 * Split text into overlapping chunks
 */
function splitTextIntoChunks(text, chunkSize = 800, overlap = 150) {
  if (!text || !text.trim()) return [];
  const cleanText = text.replace(/\s+/g, ' ').trim();
  const chunks = [];
  let index = 0;

  while (index < cleanText.length) {
    let end = index + chunkSize;
    if (end < cleanText.length) {
      // Avoid splitting words if possible
      const lastSpace = cleanText.lastIndexOf(' ', end);
      if (lastSpace > index + chunkSize * 0.7) {
        end = lastSpace;
      }
    }
    const chunk = cleanText.substring(index, end).trim();
    if (chunk) chunks.push(chunk);
    index = end - overlap;
    if (index >= cleanText.length - overlap) break;
  }
  return chunks;
}

/**
 * Generate vector embeddings from configured provider
 */
async function generateEmbedding(text, provider, apiKey, model) {
  if (!apiKey) throw new Error('API key is required for RAG embeddings');
  const cleanProvider = provider || 'openai';

  if (cleanProvider === 'openai') {
    const activeModel = model || 'text-embedding-3-small';
    const body = JSON.stringify({ model: activeModel, input: text });
    
    return new Promise((resolve, reject) => {
      const req = https.request({
        hostname: 'api.openai.com',
        path: '/v1/embeddings',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        timeout: 15000
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (res.statusCode >= 400) {
              reject(new Error(`OpenAI Embedding Error (${res.statusCode}): ${parsed.error?.message || data}`));
            } else {
              resolve(parsed.data[0].embedding);
            }
          } catch(e) {
            reject(new Error('Failed to parse OpenAI embedding response'));
          }
        });
      });
      req.on('error', reject);
      req.write(body);
      req.end();
    });
  } else if (cleanProvider === 'gemini') {
    const activeModel = model || 'text-embedding-004';
    const body = JSON.stringify({
      model: `models/${activeModel}`,
      content: { parts: [{ text }] }
    });

    return new Promise((resolve, reject) => {
      const req = https.request({
        hostname: 'generativelanguage.googleapis.com',
        path: `/v1beta/models/${activeModel}:embedContent?key=${apiKey}`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        timeout: 15000
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (res.statusCode >= 400) {
              reject(new Error(`Gemini Embedding Error (${res.statusCode}): ${parsed.error?.message || data}`));
            } else if (parsed.embedding?.values) {
              resolve(parsed.embedding.values);
            } else {
              reject(new Error(`Invalid Gemini embedding response structure: ${data}`));
            }
          } catch(e) {
            reject(new Error('Failed to parse Gemini embedding response'));
          }
        });
      });
      req.on('error', reject);
      req.write(body);
      req.end();
    });
  } else if (cleanProvider === 'custom') {
    // Custom OpenAI compatible endpoint: expects model and custom URL
    // We parse custom URL from the model or model field: format can be e.g. "model_name|https://api.mycustomendpoint.com/v1/embeddings"
    let endpointUrl = 'https://api.openai.com/v1/embeddings';
    let activeModel = 'text-embedding-3-small';
    if (model.includes('|')) {
      const parts = model.split('|');
      activeModel = parts[0];
      endpointUrl = parts[1];
    } else {
      activeModel = model;
    }

    const body = JSON.stringify({ model: activeModel, input: text });
    const parsedUrl = new URL(endpointUrl);
    const client = parsedUrl.protocol === 'https:' ? https : http;

    return new Promise((resolve, reject) => {
      const req = client.request({
        hostname: parsedUrl.hostname,
        port: parsedUrl.port,
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        timeout: 15000
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (res.statusCode >= 400) {
              reject(new Error(`Custom Embedding Error (${res.statusCode}): ${parsed.error?.message || data}`));
            } else {
              resolve(parsed.data[0].embedding);
            }
          } catch(e) {
            reject(new Error('Failed to parse Custom embedding response'));
          }
        });
      });
      req.on('error', reject);
      req.write(body);
      req.end();
    });
  } else {
    throw new Error(`Unsupported RAG embedding provider: ${provider}`);
  }
}

/**
 * Calculate Cosine Similarity
 */
function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Simple BM25-like keyword matching fallback
 */
function keywordSearch(query, chunks, limit = 4) {
  const queryWords = query.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean);
  if (queryWords.length === 0) return chunks.slice(0, limit);

  const scored = chunks.map(chunk => {
    const contentLower = chunk.content.toLowerCase();
    let score = 0;
    queryWords.forEach(word => {
      if (contentLower.includes(word)) {
        score += 1;
        // extra points for exact word boundary matches
        const regex = new RegExp('\\b' + word + '\\b', 'g');
        const matches = contentLower.match(regex);
        if (matches) score += matches.length * 1.5;
      }
    });
    return { chunk, score };
  });

  return scored
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(item => item.chunk);
}

/**
 * Retrieve top relevant chunks for a user query
 */
async function retrieveRelevantContext(query, chatbot, limit = 4) {
  const chunks = await prisma.documentChunk.findMany({
    where: { chatbotId: chatbot.id }
  });

  if (chunks.length === 0) return '';

  // If RAG configurations are missing or disabled, fall back to keyword search
  if (!chatbot.ragEnabled || !chatbot.ragApiKey) {
    const matched = keywordSearch(query, chunks, limit);
    return matched.map(c => c.content).join('\n\n');
  }

  try {
    const decryptedKey = decrypt(chatbot.ragApiKey);
    const queryVector = await generateEmbedding(query, chatbot.ragProvider, decryptedKey, chatbot.ragModel);
    
    const scored = chunks.map(chunk => {
      let chunkVector = [];
      try {
        chunkVector = JSON.parse(chunk.embedding || '[]');
      } catch(e) {}
      
      const similarity = cosineSimilarity(queryVector, chunkVector);
      return { chunk, similarity };
    });

    const matched = scored
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit)
      .map(item => item.chunk);

    return matched.map(c => c.content).join('\n\n');
  } catch (err) {
    console.warn('Embedding search failed, using keyword search fallback:', err.message);
    const matched = keywordSearch(query, chunks, limit);
    return matched.map(c => c.content).join('\n\n');
  }
}

module.exports = {
  splitTextIntoChunks,
  generateEmbedding,
  retrieveRelevantContext
};
