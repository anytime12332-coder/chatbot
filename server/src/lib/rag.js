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

  // Normalize vertical and horizontal spacing
  const normalized = text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  // Production-level chunk size: 800 characters, overlap: 150 characters (approx 200/35 tokens)
  const chunkSize = 800;
  const chunkOverlap = 150;

  const separators = ['\n\n', '\n', '. ', '! ', '? ', ' ', ''];

  // Helper to split a text by separators recursively
  function splitOnSeparators(textToSplit, separatorIndex) {
    if (textToSplit.length <= chunkSize) {
      return [textToSplit];
    }
    if (separatorIndex >= separators.length) {
      // Out of separators, fallback to character slicing
      const result = [];
      let pos = 0;
      while (pos < textToSplit.length) {
        result.push(textToSplit.substring(pos, pos + chunkSize));
        pos += chunkSize;
      }
      return result;
    }
    const separator = separators[separatorIndex];
    const parts = textToSplit.split(separator);
    const result = [];
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (part === '') continue;
      // Re-add separator to parts (except last one or if separator is empty)
      const partWithSep = (i < parts.length - 1 && separator !== '') ? part + separator : part;
      
      if (partWithSep.length > chunkSize) {
        result.push(...splitOnSeparators(partWithSep, separatorIndex + 1));
      } else {
        result.push(partWithSep);
      }
    }
    return result;
  }

  const parts = splitOnSeparators(normalized, 0);

  // Group parts into chunks with overlap
  const chunks = [];
  let chunkIndex = 0;
  let currentChunkParts = [];
  let currentChunkLength = 0;
  let currentHeading = null;
  let searchOffset = 0;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];

    // Heading detection heuristic:
    const isHeading = part.startsWith('#') || (part.length < 100 && !part.includes('\n') && !/[.!?]$/.test(part));
    if (isHeading) {
      currentHeading = part.replace(/^#+\s*/, '').trim();
    }

    if (currentChunkLength + part.length > chunkSize && currentChunkParts.length > 0) {
      // Chunk is full, finalize it
      const chunkText = currentChunkParts.join('').trim();
      if (chunkText) {
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
      }

      // Rollback currentChunkParts to satisfy overlap
      while (currentChunkParts.length > 0) {
        const remainingLength = currentChunkParts.join('').length;
        if (remainingLength <= chunkOverlap || currentChunkParts.length === 1) {
          break;
        }
        currentChunkParts.shift();
      }
      currentChunkLength = currentChunkParts.join('').length;
    }

    currentChunkParts.push(part);
    currentChunkLength += part.length;
  }

  // Push final chunk if any
  if (currentChunkParts.length > 0) {
    const chunkText = currentChunkParts.join('').trim();
    if (chunkText) {
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
async function getHybridSearchResults(query, chatbot, limit = 8) {
  const RELEVANCE_THRESHOLD = 0.35; // Gentle threshold to filter out noise
  const ALPHA = 0.7; // Hybrid weights: 70% semantic, 30% lexical

  const chunks = await prisma.documentChunk.findMany({
    where: { chatbotId: chatbot.id }
  });

  if (chunks.length === 0) return [];

  // Decompose query
  const subQueries = await decomposeQuery(query, chatbot);

  // Helper to calculate lexical score (0.0 to 1.0)
  function getLexicalScore(subQuery, chunkContent) {
    const stopwords = new Set(['a', 'an', 'the', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'to', 'of', 'in', 'on', 'at', 'by', 'for', 'with', 'about', 'against', 'between', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'from', 'up', 'down', 'in', 'out', 'off', 'over', 'under', 'again', 'further', 'then', 'once']);
    
    const queryTerms = subQuery.toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(t => t.length > 1 && !stopwords.has(t));
      
    if (queryTerms.length === 0) return 0;
    
    const contentLower = chunkContent.toLowerCase();
    let matches = 0;
    
    queryTerms.forEach(term => {
      if (contentLower.includes(term)) {
        matches++;
        // Add exact boundary match bonus
        const regex = new RegExp('\\b' + term + '\\b', 'i');
        if (regex.test(contentLower)) {
          matches += 0.2;
        }
      }
    });
    
    return Math.min(1.0, matches / queryTerms.length);
  }

  const runKeywordFallback = () => {
    const uniqueMap = new Map();
    for (const subQ of subQueries) {
      const matched = keywordSearch(subQ, chunks, limit);
      matched.forEach((chunk, index) => {
        const existing = uniqueMap.get(chunk.id);
        const score = 1.0 - (index / limit); // proxy score based on rank
        if (!existing || score > existing.hybridScore) {
          uniqueMap.set(chunk.id, {
            chunk,
            semanticSim: 0,
            lexicalScore: score,
            hybridScore: score
          });
        }
      });
    }
    return Array.from(uniqueMap.values()).sort((a, b) => b.hybridScore - a.hybridScore);
  };

  // If RAG configurations are missing or disabled, fall back to keyword search
  if (!chatbot.ragEnabled || !chatbot.ragApiKey) {
    return runKeywordFallback();
  }

  try {
    const decryptedKey = decrypt(chatbot.ragApiKey);
    const uniqueChunksMap = new Map();

    for (const subQ of subQueries) {
      const textToEmbed = subQ;
      const queryVector = await generateEmbedding(textToEmbed, chatbot.ragProvider, decryptedKey, chatbot.ragModel);
      
      for (const chunk of chunks) {
        let chunkVector = [];
        try {
          chunkVector = JSON.parse(chunk.embedding || '[]');
        } catch (e) {}
        
        const semanticSim = cosineSimilarity(queryVector, chunkVector);
        const lexicalScore = getLexicalScore(subQ, chunk.content);
        
        // Calculate hybrid score
        const hybridScore = ALPHA * semanticSim + (1 - ALPHA) * lexicalScore;
        
        // Keep if semantic matches gentle threshold or keyword match is strong
        if (semanticSim >= RELEVANCE_THRESHOLD || lexicalScore >= 0.8) {
          const existing = uniqueChunksMap.get(chunk.id);
          if (!existing || hybridScore > existing.hybridScore) {
            uniqueChunksMap.set(chunk.id, { 
              chunk, 
              semanticSim, 
              lexicalScore, 
              hybridScore 
            });
          }
        }
      }
    }

    const results = Array.from(uniqueChunksMap.values()).sort((a, b) => b.hybridScore - a.hybridScore);
    if (results.length === 0) {
      return runKeywordFallback();
    }
    return results;
  } catch (err) {
    console.warn('Embedding search failed, using keyword search fallback:', err.message);
    return runKeywordFallback();
  }
}

/**
 * Retrieve top relevant chunks for a user query
 */
async function retrieveRelevantContext(query, chatbot, limit = 8) {
  try {
    const candidates = await getHybridSearchResults(query, chatbot, limit);
    if (candidates.length === 0) return '';

    // Cap total injected RAG token budget to 2500 tokens
    const BUDGET_LIMIT = 2500;
    let currentTokens = 0;
    const selectedChunks = [];

    for (const item of candidates) {
      const chunkTokens = enc.encode(item.chunk.content).length;
      if (currentTokens + chunkTokens <= BUDGET_LIMIT) {
        selectedChunks.push(item.chunk);
        currentTokens += chunkTokens;
      }
      if (selectedChunks.length >= limit) break;
    }

    // Re-sort selected chunks chronologically by chunkIndex to preserve narrative order
    selectedChunks.sort((a, b) => a.chunkIndex - b.chunkIndex);

    return selectedChunks.map(c => c.content).join('\n\n---\n\n');
  } catch (err) {
    console.error('retrieveRelevantContext error:', err);
    return '';
  }
}

module.exports = {
  splitTextIntoChunks,
  generateEmbedding,
  getHybridSearchResults,
  retrieveRelevantContext
};
