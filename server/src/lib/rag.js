const https = require('https');
const http = require('http');
const prisma = require('./prisma');
const { decrypt } = require('./encryption');
const { getAIResponse } = require('./aiProviders');
const { getEncoding } = require('js-tiktoken');
const enc = getEncoding("cl100k_base");

/**
 * Split a text into sentences, handling abbreviations and decimals.
 */
function splitSentences(text) {
  if (!text) return [];
  const sentences = [];
  let currentSentence = [];
  const tokens = text.split(/(\s+)/);
  
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (!token) continue;
    currentSentence.push(token);
    
    if (/[.!?]$/.test(token.trim())) {
      const word = token.trim();
      const isAbbreviation = /\b(?:Mr|Dr|Ms|Co|Inc|Ltd|Jr|Sr|vs|eg|ie|etc|e\.g|i\.e|a\.m|p\.m)\.$/i.test(word);
      
      let isDecimal = false;
      if (/\b\d+\.$/.test(word)) {
        let nextWord = '';
        for (let j = i + 1; j < tokens.length; j++) {
          if (tokens[j].trim()) {
            nextWord = tokens[j].trim();
            break;
          }
        }
        if (/^\d+/.test(nextWord)) {
          isDecimal = true;
        }
      }
      
      if (!isAbbreviation && !isDecimal) {
        sentences.push(currentSentence.join(''));
        currentSentence = [];
      }
    }
  }
  if (currentSentence.length > 0) {
    sentences.push(currentSentence.join(''));
  }
  
  return sentences.map(s => s.trim()).filter(Boolean);
}

/**
 * Split text into overlapping chunks, preserving paragraphs and formatting.
 * Change sizing from character-based to token-based: target 300-500 tokens/chunk.
 */
function splitTextIntoChunks(text, targetTokens = 400) {
  if (!text || !text.trim()) return [];

  // Step 1: Normalize vertical spacing and horizontal spacing
  const normalized = text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const paragraphs = normalized.split(/\n\n+/);
  const chunks = [];
  let chunkIndex = 0;
  
  let currentChunkSentences = [];
  let currentChunkTokens = 0;
  let currentHeading = null;
  let searchOffset = 0;
  
  for (let i = 0; i < paragraphs.length; i++) {
    const para = paragraphs[i].trim();
    if (!para) continue;
    
    // Heading detection heuristic:
    const isHeading = para.startsWith('#') || (para.length < 100 && !para.includes('\n') && !/[.!?]$/.test(para));
    if (isHeading) {
      currentHeading = para.replace(/^#+\s*/, '').trim();
    }
    
    const sentences = splitSentences(para);
    
    for (const sentence of sentences) {
      const sentenceTokens = enc.encode(sentence).length;
      
      // Giant sentence fallback
      if (sentenceTokens > 500) {
        if (currentChunkSentences.length > 0) {
          const chunkText = currentChunkSentences.join(' ');
          const charStart = normalized.indexOf(chunkText, searchOffset);
          let charEnd = null;
          if (charStart !== -1) {
            charEnd = charStart + chunkText.length;
            searchOffset = charStart + 1;
          }
          chunks.push({
            content: chunkText,
            chunkIndex: chunkIndex++,
            sectionHeading: currentHeading,
            charStart: charStart !== -1 ? charStart : null,
            charEnd: charStart !== -1 ? charEnd : null
          });
          currentChunkSentences = [];
          currentChunkTokens = 0;
        }
        
        // Split by raw character size as last resort
        let pos = 0;
        while (pos < sentence.length) {
          const chunkText = sentence.substring(pos, pos + 1200);
          const charStart = normalized.indexOf(chunkText, searchOffset);
          let charEnd = null;
          if (charStart !== -1) {
            charEnd = charStart + chunkText.length;
            searchOffset = charStart + 1;
          }
          chunks.push({
            content: chunkText,
            chunkIndex: chunkIndex++,
            sectionHeading: currentHeading,
            charStart: charStart !== -1 ? charStart : null,
            charEnd: charStart !== -1 ? charEnd : null
          });
          pos += 1000; // 200 char overlap
        }
        continue;
      }
      
      if (currentChunkSentences.length > 0 && (currentChunkTokens + sentenceTokens > 450)) {
        const chunkText = currentChunkSentences.join(' ');
        const charStart = normalized.indexOf(chunkText, searchOffset);
        let charEnd = null;
        if (charStart !== -1) {
          charEnd = charStart + chunkText.length;
          searchOffset = charStart + 1;
        }
        
        chunks.push({
          content: chunkText,
          chunkIndex: chunkIndex++,
          sectionHeading: currentHeading,
          charStart: charStart !== -1 ? charStart : null,
          charEnd: charStart !== -1 ? charEnd : null
        });
        
        // Carry over last 2 sentences for overlap context (10-20%)
        const overlapSentences = currentChunkSentences.slice(-2);
        currentChunkSentences = [...overlapSentences];
        currentChunkTokens = currentChunkSentences.reduce((sum, s) => sum + enc.encode(s).length, 0);
      }
      
      currentChunkSentences.push(sentence);
      currentChunkTokens += sentenceTokens;
    }
  }
  
  if (currentChunkSentences.length > 0) {
    const chunkText = currentChunkSentences.join(' ');
    const charStart = normalized.indexOf(chunkText, searchOffset);
    let charEnd = null;
    if (charStart !== -1) {
      charEnd = charStart + chunkText.length;
    }
    
    chunks.push({
      content: chunkText,
      chunkIndex: chunkIndex++,
      sectionHeading: currentHeading,
      charStart: charStart !== -1 ? charStart : null,
      charEnd: charStart !== -1 ? charEnd : null
    });
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
  } else if (cleanProvider === 'openrouter') {
    const activeModel = model || 'openai/text-embedding-3-small';
    const body = JSON.stringify({ model: activeModel, input: text });
    
    return new Promise((resolve, reject) => {
      const req = https.request({
        hostname: 'openrouter.ai',
        path: '/api/v1/embeddings',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://openrouter.ai',
          'X-Title': 'Chatbot RAG'
        },
        timeout: 15000
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (res.statusCode >= 400) {
              reject(new Error(`OpenRouter Embedding Error (${res.statusCode}): ${parsed.error?.message || data}`));
            } else {
              resolve(parsed.data[0].embedding);
            }
          } catch(e) {
            reject(new Error('Failed to parse OpenRouter embedding response'));
          }
        });
      });
      req.on('error', reject);
      req.write(body);
      req.end();
    });
  } else if (cleanProvider === 'custom') {
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
 * Decompose a query into sub-queries using LLM
 */
async function decomposeQuery(query, chatbot) {
  const decryptedConfig = chatbot.apiConfig ? {
    ...chatbot.apiConfig,
    apiKey: decrypt(chatbot.apiConfig.apiKey),
  } : null;

  if (decryptedConfig && decryptedConfig.apiKey) {
    try {
      const prompt = `You are a query decomposition assistant. Your task is to split a complex search query containing multiple questions or distinct topics into a JSON list of simple, search-optimized sub-queries.

STRICT RULES:
1. Output ONLY a valid JSON array of strings.
2. Do NOT output markdown code blocks (no \`\`\`json, no \`\`\`), do NOT write any explanation.
3. If the query is simple, contains a single question, or cannot be decomposed, return a JSON array with just the original query.
4. Each sub-query should be a standalone search query.

Example: "What is your pricing and how do I contact support?" -> ["What is your pricing", "how do I contact support"]`;

      const messages = [
        { role: 'system', content: prompt },
        { role: 'user', content: query }
      ];

      const result = await getAIResponse(messages, decryptedConfig);
      let content = result.content?.trim() || '';
      
      if (content.startsWith('```')) {
        content = content.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
      }

      const parsed = JSON.parse(content);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map(q => q.trim()).filter(Boolean);
      }
    } catch (err) {
      console.warn('LLM query decomposition failed, using fallback:', err.message);
    }
  }

  // Fallback: simple heuristic decomposition on question marks or "and"
  if ((query.match(/\?/g) || []).length > 1) {
    const parts = query.split(/\?+/).map(q => q.trim()).filter(q => q.length > 5);
    if (parts.length > 1) {
      return parts.map(p => p + '?');
    }
  }
  return [query];
}

/**
 * Retrieve top relevant chunks for a user query
 */
async function retrieveRelevantContext(query, chatbot, limit = 6) {
  const RELEVANCE_THRESHOLD = 0.75; // Industry-grade relevance threshold

  const chunks = await prisma.documentChunk.findMany({
    where: { chatbotId: chatbot.id }
  });

  if (chunks.length === 0) return '';

  // Decompose query
  const subQueries = await decomposeQuery(query, chatbot);

  // If RAG configurations are missing or disabled, fall back to keyword search
  if (!chatbot.ragEnabled || !chatbot.ragApiKey) {
    const allMatched = [];
    for (const subQ of subQueries) {
      const matched = keywordSearch(subQ, chunks, limit);
      allMatched.push(...matched);
    }
    const uniqueMap = new Map();
    allMatched.forEach(c => uniqueMap.set(c.id, c));
    const finalChunks = Array.from(uniqueMap.values());
    finalChunks.sort((a, b) => a.chunkIndex - b.chunkIndex);
    return finalChunks.map(c => c.content).join('\n\n---\n\n');
  }

  try {
    const decryptedKey = decrypt(chatbot.ragApiKey);
    const uniqueChunksMap = new Map();

    for (const subQ of subQueries) {
      const queryVector = await generateEmbedding(subQ, chatbot.ragProvider, decryptedKey, chatbot.ragModel);
      
      for (const chunk of chunks) {
        let chunkVector = [];
        try {
          chunkVector = JSON.parse(chunk.embedding || '[]');
        } catch (e) {}
        
        const similarity = cosineSimilarity(queryVector, chunkVector);
        if (similarity >= RELEVANCE_THRESHOLD) {
          const existing = uniqueChunksMap.get(chunk.id);
          if (!existing || similarity > existing.maxSimilarity) {
            uniqueChunksMap.set(chunk.id, { chunk, maxSimilarity: similarity });
          }
        }
      }
    }

    const candidates = Array.from(uniqueChunksMap.values())
      .sort((a, b) => b.maxSimilarity - a.maxSimilarity);

    // If embedding search yielded nothing above threshold, perform keyword fallback
    if (candidates.length === 0) {
      const allFallbackMatched = [];
      for (const subQ of subQueries) {
        const fallbackMatched = keywordSearch(subQ, chunks, 3);
        allFallbackMatched.push(...fallbackMatched);
      }
      const uniqueFallbackMap = new Map();
      allFallbackMatched.forEach(c => uniqueFallbackMap.set(c.id, c));
      const finalFallback = Array.from(uniqueFallbackMap.values());
      finalFallback.sort((a, b) => a.chunkIndex - b.chunkIndex);
      return finalFallback.map(c => c.content).join('\n\n---\n\n');
    }

    // Cap total injected RAG token budget to 1,500 tokens
    const BUDGET_LIMIT = 1500;
    let currentTokens = 0;
    const selectedChunks = [];

    for (const item of candidates) {
      const chunkTokens = enc.encode(item.chunk.content).length;
      if (currentTokens + chunkTokens <= BUDGET_LIMIT) {
        selectedChunks.push(item.chunk);
        currentTokens += chunkTokens;
      }
    }

    // Re-sort selected chunks chronologically by chunkIndex to preserve narrative order
    selectedChunks.sort((a, b) => a.chunkIndex - b.chunkIndex);

    return selectedChunks.map(c => c.content).join('\n\n---\n\n');
  } catch (err) {
    console.warn('Embedding search failed, using keyword search fallback:', err.message);
    const allFallbackMatched = [];
    for (const subQ of subQueries) {
      const matched = keywordSearch(subQ, chunks, limit);
      allFallbackMatched.push(...matched);
    }
    const uniqueFallbackMap = new Map();
    allFallbackMatched.forEach(c => uniqueFallbackMap.set(c.id, c));
    const finalFallback = Array.from(uniqueFallbackMap.values());
    finalFallback.sort((a, b) => a.chunkIndex - b.chunkIndex);
    return finalFallback.map(c => c.content).join('\n\n---\n\n');
  }
}

module.exports = {
  splitTextIntoChunks,
  generateEmbedding,
  retrieveRelevantContext
};
