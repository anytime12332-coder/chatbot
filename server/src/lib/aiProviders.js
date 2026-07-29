const https = require('https');
const http = require('http');

/**
 * AI Provider abstraction layer
 * Supports: OpenAI, Gemini, Claude, OpenRouter, Custom
 * Now with SSE streaming support
 */

const PROVIDER_CONFIGS = {
  openai: {
    baseUrl: 'https://api.openai.com/v1/chat/completions',
    defaultModel: 'gpt-3.5-turbo',
    models: ['gpt-3.5-turbo', 'gpt-4', 'gpt-4-turbo', 'gpt-4o', 'gpt-4o-mini'],
    supportsStreaming: true,
  },
  gemini: {
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    defaultModel: 'gemini-1.5-flash',
    models: ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-2.0-flash'],
    supportsStreaming: false,
  },
  claude: {
    baseUrl: 'https://api.anthropic.com/v1/messages',
    defaultModel: 'claude-3-haiku-20240307',
    models: ['claude-3-haiku-20240307', 'claude-3-sonnet-20240229', 'claude-3-5-sonnet-20241022', 'claude-3-opus-20240229'],
    supportsStreaming: true,
  },
  openrouter: {
    baseUrl: 'https://openrouter.ai/api/v1/chat/completions',
    defaultModel: 'openai/gpt-3.5-turbo',
    models: ['openai/gpt-3.5-turbo', 'openai/gpt-4o', 'anthropic/claude-3-haiku', 'google/gemini-flash-1.5', 'meta-llama/llama-3.1-8b-instruct'],
    supportsStreaming: true,
  },
  custom: {
    baseUrl: '',
    defaultModel: '',
    models: [],
    supportsStreaming: true,
  },
};

function makeRequest(url, options, body) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const client = parsedUrl.protocol === 'https:' ? https : http;

    const req = client.request({
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname + parsedUrl.search,
      method: options.method || 'POST',
      headers: options.headers || {},
      timeout: 60000,
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 400) {
            reject(new Error(`API Error (${res.statusCode}): ${JSON.stringify(parsed)}`));
          } else {
            resolve(parsed);
          }
        } catch (e) {
          reject(new Error(`Failed to parse response: ${data.substring(0, 200)}`));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });

    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

/**
 * Make a streaming request - returns a readable stream
 */
function makeStreamRequest(url, options, body) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const client = parsedUrl.protocol === 'https:' ? https : http;

    const req = client.request({
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname + parsedUrl.search,
      method: options.method || 'POST',
      headers: options.headers || {},
      timeout: 120000,
    }, (res) => {
      if (res.statusCode >= 400) {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => reject(new Error(`API Error (${res.statusCode}): ${data.substring(0, 300)}`)));
      } else {
        resolve(res);
      }
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Stream request timed out'));
    });

    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ==================== NON-STREAMING CALLS ====================

async function callOpenAI(messages, config) {
  const response = await makeRequest(
    config.baseUrl || PROVIDER_CONFIGS.openai.baseUrl,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
    },
    {
      model: config.model || PROVIDER_CONFIGS.openai.defaultModel,
      messages,
      max_tokens: config.maxTokens || 1024,
      temperature: config.temperature || 0.7,
    }
  );
  return {
    content: response.choices[0].message.content,
    tokenCount: (response.usage?.total_tokens) || 0,
  };
}

async function callGemini(messages, config) {
  const model = config.model || PROVIDER_CONFIGS.gemini.defaultModel;
  const url = `${PROVIDER_CONFIGS.gemini.baseUrl}/models/${model}:generateContent?key=${config.apiKey}`;
  const systemInstruction = messages.find(m => m.role === 'system');
  const chatMessages = messages.filter(m => m.role !== 'system');
  const contents = chatMessages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));
  const body = {
    contents,
    generationConfig: {
      maxOutputTokens: config.maxTokens || 1024,
      temperature: config.temperature || 0.7,
    },
  };
  if (systemInstruction) {
    body.systemInstruction = { parts: [{ text: systemInstruction.content }] };
  }
  const response = await makeRequest(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  }, body);
  const text = response.candidates?.[0]?.content?.parts?.[0]?.text || 'No response generated.';
  const tokenCount = response.usageMetadata?.totalTokenCount || 0;
  return { content: text, tokenCount };
}

async function callClaude(messages, config) {
  const systemMsg = messages.find(m => m.role === 'system');
  const chatMessages = messages.filter(m => m.role !== 'system');
  const body = {
    model: config.model || PROVIDER_CONFIGS.claude.defaultModel,
    max_tokens: config.maxTokens || 1024,
    messages: chatMessages.map(m => ({ role: m.role, content: m.content })),
  };
  if (systemMsg) body.system = systemMsg.content;
  const response = await makeRequest(
    config.baseUrl || PROVIDER_CONFIGS.claude.baseUrl,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01',
      },
    },
    body
  );
  return {
    content: response.content[0].text,
    tokenCount: (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0),
  };
}

async function callOpenRouter(messages, config) {
  const response = await makeRequest(
    PROVIDER_CONFIGS.openrouter.baseUrl,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
        'HTTP-Referer': 'https://chatbot-saas.railway.app',
      },
    },
    {
      model: config.model || PROVIDER_CONFIGS.openrouter.defaultModel,
      messages,
      max_tokens: config.maxTokens || 1024,
      temperature: config.temperature || 0.7,
    }
  );
  return {
    content: response.choices[0].message.content,
    tokenCount: (response.usage?.total_tokens) || 0,
  };
}

async function callCustom(messages, config) {
  if (!config.baseUrl) throw new Error('Custom provider requires a base URL');
  const response = await makeRequest(
    config.baseUrl,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
    },
    {
      model: config.model,
      messages,
      max_tokens: config.maxTokens || 1024,
      temperature: config.temperature || 0.7,
    }
  );
  return {
    content: response.choices?.[0]?.message?.content || response.content || 'No response',
    tokenCount: response.usage?.total_tokens || 0,
  };
}

async function getAIResponse(messages, config) {
  const provider = config.provider || 'openai';
  switch (provider) {
    case 'openai': return callOpenAI(messages, config);
    case 'gemini': return callGemini(messages, config);
    case 'claude': return callClaude(messages, config);
    case 'openrouter': return callOpenRouter(messages, config);
    case 'custom': return callCustom(messages, config);
    default: throw new Error(`Unknown provider: ${provider}`);
  }
}

// ==================== STREAMING CALLS ====================

/**
 * Stream OpenAI-compatible response (works for OpenAI, OpenRouter, Custom)
 * Calls onChunk(text) for each token, returns full content + tokenCount
 */
async function streamOpenAICompatible(url, headers, body, onChunk) {
  body.stream = true;
  const stream = await makeStreamRequest(url, { method: 'POST', headers }, body);

  let fullContent = '';
  let buffer = '';

  return new Promise((resolve, reject) => {
    stream.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6);
        if (data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) {
            fullContent += delta;
            onChunk(delta);
          }
        } catch (e) {
          // skip unparseable chunks
        }
      }
    });

    stream.on('end', () => {
      resolve({ content: fullContent, tokenCount: 0 });
    });

    stream.on('error', reject);
  });
}

/**
 * Stream Claude response
 */
async function streamClaude(messages, config, onChunk) {
  const systemMsg = messages.find(m => m.role === 'system');
  const chatMessages = messages.filter(m => m.role !== 'system');
  const body = {
    model: config.model || PROVIDER_CONFIGS.claude.defaultModel,
    max_tokens: config.maxTokens || 1024,
    messages: chatMessages.map(m => ({ role: m.role, content: m.content })),
    stream: true,
  };
  if (systemMsg) body.system = systemMsg.content;

  const stream = await makeStreamRequest(
    config.baseUrl || PROVIDER_CONFIGS.claude.baseUrl,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01',
      },
    },
    body
  );

  let fullContent = '';
  let buffer = '';
  let tokenCount = 0;

  return new Promise((resolve, reject) => {
    stream.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6);

        try {
          const parsed = JSON.parse(data);
          if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
            fullContent += parsed.delta.text;
            onChunk(parsed.delta.text);
          }
          if (parsed.type === 'message_delta' && parsed.usage) {
            tokenCount = (parsed.usage.input_tokens || 0) + (parsed.usage.output_tokens || 0);
          }
        } catch (e) {
          // skip
        }
      }
    });

    stream.on('end', () => {
      resolve({ content: fullContent, tokenCount });
    });

    stream.on('error', reject);
  });
}

/**
 * Get streaming AI response
 * onChunk(text) is called for each token
 * Falls back to non-streaming for providers that don't support it
 */
async function getAIResponseStreaming(messages, config, onChunk) {
  const provider = config.provider || 'openai';

  switch (provider) {
    case 'openai':
      return streamOpenAICompatible(
        config.baseUrl || PROVIDER_CONFIGS.openai.baseUrl,
        { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.apiKey}` },
        {
          model: config.model || PROVIDER_CONFIGS.openai.defaultModel,
          messages,
          max_tokens: config.maxTokens || 1024,
          temperature: config.temperature || 0.7,
        },
        onChunk
      );

    case 'claude':
      return streamClaude(messages, config, onChunk);

    case 'openrouter':
      return streamOpenAICompatible(
        PROVIDER_CONFIGS.openrouter.baseUrl,
        {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`,
          'HTTP-Referer': 'https://chatbot-saas.railway.app',
        },
        {
          model: config.model || PROVIDER_CONFIGS.openrouter.defaultModel,
          messages,
          max_tokens: config.maxTokens || 1024,
          temperature: config.temperature || 0.7,
        },
        onChunk
      );

    case 'custom':
      if (!config.baseUrl) throw new Error('Custom provider requires a base URL');
      return streamOpenAICompatible(
        config.baseUrl,
        { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.apiKey}` },
        {
          model: config.model,
          messages,
          max_tokens: config.maxTokens || 1024,
          temperature: config.temperature || 0.7,
        },
        onChunk
      );

    case 'gemini': {
      // Gemini doesn't support SSE well, fall back to non-streaming
      const result = await callGemini(messages, config);
      onChunk(result.content);
      return result;
    }

    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

module.exports = { getAIResponse, getAIResponseStreaming, PROVIDER_CONFIGS };
