const express = require('express');
const prisma = require('../lib/prisma');
const { getAIResponse, getAIResponseStreaming } = require('../lib/aiProviders');
const { decrypt } = require('../lib/encryption');
const { aiQueue } = require('../lib/queue');
const { v4: uuidv4 } = require('uuid');
const { authMiddleware } = require('../lib/auth');
const https = require('https');
const http = require('http');

const router = express.Router();

/**
 * Build the system prompt from chatbot config
 */
function buildSystemPrompt(chatbot) {
  const parts = [];
  if (chatbot.systemPrompt) parts.push(chatbot.systemPrompt);
  if (chatbot.businessName) parts.push(`Business Name: ${chatbot.businessName}`);
  if (chatbot.businessInfo) parts.push(`Business Information: ${chatbot.businessInfo}`);
  return parts.join('\n\n');
}

/**
 * Get or create conversation + build AI messages array.
 * Also returns the raw history array for use in classifyIntent.
 */
async function prepareChat(message, sessionId, chatbotId, pageUrl, ip) {
  const chatbot = await prisma.chatbot.findUnique({
    where: { id: chatbotId },
    include: { apiConfig: true },
  });

  if (!chatbot) throw { status: 404, message: 'Bot not found' };
  if (!chatbot.isActive) throw { status: 403, message: 'Bot is currently disabled' };
  if (!chatbot.apiConfig?.apiKey) throw { status: 500, message: 'Bot is not configured properly' };

  const currentSessionId = sessionId || uuidv4();

  let conversation = await prisma.conversation.findFirst({
    where: { sessionId: currentSessionId, chatbotId, status: 'active' },
    include: {
      messages: { orderBy: { createdAt: 'desc' }, take: 20 },
    },
  });

  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: { sessionId: currentSessionId, chatbotId, visitorIp: ip || '', pageUrl: pageUrl || '' },
      include: { messages: true },
    });
  }

  // The most recent 20 messages are fetched newest-first; restore chronological order
  const history = [...conversation.messages].reverse();

  // Save user message and bump the conversation's updatedAt
  await prisma.message.create({
    data: { role: 'user', content: message.trim(), conversationId: conversation.id },
  });
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { updatedAt: new Date() },
  });

  // Build AI messages (with RAG if enabled)
  let systemPromptText = '';
  if (chatbot.ragEnabled) {
    const { retrieveRelevantContext } = require('../lib/rag');
    const retrievedContext = await retrieveRelevantContext(message.trim(), chatbot);

    const parts = [];
    if (chatbot.systemPrompt) parts.push(chatbot.systemPrompt);
    if (chatbot.businessName) parts.push(`Business Name: ${chatbot.businessName}`);
    if (retrievedContext) {
      parts.push(`Relevant Business Context (use this to answer user questions):\n${retrievedContext}`);
    } else if (chatbot.businessInfo) {
      parts.push(`Business Information: ${chatbot.businessInfo}`);
    }
    systemPromptText = parts.join('\n\n');
  } else {
    systemPromptText = buildSystemPrompt(chatbot);
  }

  const aiMessages = [
    { role: 'system', content: systemPromptText },
    ...history.map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: message.trim() },
  ];

  // Decrypt API key
  const decryptedConfig = {
    ...chatbot.apiConfig,
    apiKey: decrypt(chatbot.apiConfig.apiKey),
  };

  return { chatbot, conversation, currentSessionId, aiMessages, decryptedConfig, history };
}

/**
 * Triggers webhook with lead details.
 * Retries up to `retries` times with linear backoff.
 * Uses explicit UTF-8 byte length to avoid encoding bugs with non-ASCII characters.
 */
async function triggerWebhook(url, payload, retries = 3) {
  if (!url) return { error: 'No webhook URL provided' };

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const body = JSON.stringify(payload);
      const result = await new Promise((resolve, reject) => {
        const parsedUrl = new URL(url);
        const client = parsedUrl.protocol === 'https:' ? https : http;

        const req = client.request({
          hostname: parsedUrl.hostname,
          port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
          path: parsedUrl.pathname + parsedUrl.search,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Content-Length': Buffer.byteLength(body, 'utf8'),
            'X-Chatbot-Event': payload.event || 'lead.captured',
            'X-Attempt': String(attempt),
          },
          timeout: 10000,
        }, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => resolve({ status: res.statusCode, data }));
        });

        req.on('error', reject);
        req.on('timeout', () => {
          req.destroy();
          reject(new Error('TIMEOUT'));
        });

        req.write(body);
        req.end();
      });

      if (result.status >= 200 && result.status < 300) {
        return result;
      }
      throw new Error(`HTTP ${result.status}`);
    } catch (err) {
      console.warn(`Webhook attempt ${attempt}/${retries} failed:`, err.message);
      if (attempt < retries) {
        // Linear backoff: 1s, 2s, 3s...
        await new Promise(r => setTimeout(r, 1000 * attempt));
      } else {
        console.error('Webhook failed after all retries for URL:', url);
      }
    }
  }
  return { error: `Webhook failed after ${retries} attempts` };
}

/**
 * Classifies if the user message matches the lead capture trigger.
 * Uses conversation history for context and strict YES/NO matching.
 */
async function classifyIntent(message, triggerPrompt, conversationHistory, aiConfig) {
  try {
    const recentHistory = conversationHistory || [];

    // Build a short context window (last 4 turns) so the LLM understands state
    const dialogContext = recentHistory.slice(-4)
      .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n');

    const classificationMessages = [
      {
        role: 'system',
        content: `You are a highly precise lead-capture classification engine.
Your ONLY job: check if the user's latest message matches this exact trigger rule:
"${triggerPrompt}"

STRICT RULES:
1. Respond with ONLY the single word YES if the latest message is a CLEAR, DIRECT match for the trigger rule above.
2. Respond with ONLY the single word NO if the message is a greeting, general question, or does NOT match the trigger rule.
3. Do NOT output anything else — no punctuation, no explanation, no spaces around the word.`,
      },
      {
        role: 'user',
        content: `Conversation context:\n${dialogContext || 'None'}\n\nLatest user message: "${message}"\n\nDoes this match the trigger rule?`,
      },
    ];

    const result = await getAIResponse(classificationMessages, aiConfig);
    const content = result.content?.trim().toUpperCase();
    // Strict equality — "YES, but..." or "I think YES" won't trigger
    return content === 'YES';
  } catch (err) {
    console.error('Intent classification failed:', err);
    return false; // Safe default: don't trigger lead capture on error
  }
}

/**
 * Local field validation helper
 */
function validateField(fieldId, value, phoneFormat = 'IN') {
  const cleanVal = value.trim();
  const idLower = String(fieldId || '').toLowerCase();
  
  // Cross-validation checks to prevent unclear data inputs
  const isPureNumbers = /^\+?\d{7,15}$/.test(cleanVal.replace(/[-\s()]/g, ''));
  const hasAtSymbol = cleanVal.includes('@');

  if (idLower === 'email' || idLower.includes('email') || idLower.includes('mail')) {
    if (isPureNumbers) {
      return { is_valid: false, reason: 'unclear data (looks like a phone number instead of an email)' };
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanVal)) {
      return { is_valid: false, reason: 'invalid email pattern' };
    }
    const parts = cleanVal.split('@');
    const domain = parts[1];
    if (!domain.includes('.') || domain.endsWith('.')) {
      return { is_valid: false, reason: 'invalid domain/TLD' };
    }
    return { is_valid: true };
  }

  if (idLower === 'phone' || idLower.includes('phone') || idLower.includes('mobile') || idLower.includes('contact')) {
    if (hasAtSymbol) {
      return { is_valid: false, reason: 'unclear data (looks like an email instead of a phone number)' };
    }
    const digits = cleanVal.replace(/\D/g, '');
    if (phoneFormat === 'IN') {
      const isValidIN = (digits.length === 10 && /^[6-9]\d{9}$/.test(digits)) || 
                        (digits.length === 12 && /^91[6-9]\d{9}$/.test(digits));
      if (!isValidIN) {
        return { is_valid: false, reason: 'invalid Indian mobile format (must be 10 digits)' };
      }
    } else if (phoneFormat === 'US') {
      const isValidUS = (digits.length === 10) || (digits.length === 11 && digits.startsWith('1'));
      if (!isValidUS) {
        return { is_valid: false, reason: 'invalid US phone format (must be 10 digits)' };
      }
    } else {
      if (digits.length < 7 || digits.length > 15) {
        return { is_valid: false, reason: 'invalid phone format (7 to 15 digits required)' };
      }
    }
    return { is_valid: true };
  }

  if (idLower === 'name' || idLower.includes('name') || idLower.includes('visitor')) {
    if (hasAtSymbol) {
      return { is_valid: false, reason: 'unclear data (name cannot contain an @ symbol)' };
    }
    if (isPureNumbers || cleanVal.replace(/\D/g, '').length > 4) {
      return { is_valid: false, reason: 'unclear data (name cannot be mostly numbers)' };
    }
    if (cleanVal.length < 2) {
      return { is_valid: false, reason: 'value too short' };
    }
    return { is_valid: true };
  }

  if (cleanVal.length < 2) {
    return { is_valid: false, reason: 'value too short' };
  }

  return { is_valid: true };
}

/**
 * Extracts a clean structured value from a user's raw answer and scores the lead.
 */
async function extractValue(
  message,
  questionId,
  questionLabel,
  questionPrompt,
  aiConfig,
  phoneFormat = 'IN',
  scoringRules = {},
  history = [],
  collectedData = {}
) {
  try {
    const recentHistory = history || [];
    const dialogContext = recentHistory
      .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n');
    
    const fullContext = dialogContext + `\nUser: ${message}`;
    const rulesStr = JSON.stringify(scoringRules || {});
    const collectedStr = JSON.stringify(collectedData || {});

    const extractionMessages = [
      {
        role: 'system',
        content: `You are an AI that extracts information from user messages and evaluates lead quality.

Your FIRST task is to extract the answer for "${questionLabel}" from the user's latest response.
If the response doesn't contain a clear value, reply with the raw response as the value.

Your SECOND task is to evaluate the lead score ("hot", "warm", "cold") and provide a detailed reason why based on:
1. The full conversation history:
${fullContext}
2. The current fields already collected:
${collectedStr}
3. The custom scoring rules configured by the administrator:
${rulesStr}
4. General indicators:
- "hot": High buying intent, urgent timeline, budget mentioned or requested, or matches high-priority keywords from rules.
- "warm": Expressed interest, asks about options, pricing, or features, but no urgent timeline or specific budget.
- "cold": Just browsing, casual testing, or matches cold/spam keywords from rules.

You MUST respond ONLY with a JSON object of this structure:
{
  "extracted_value": "extracted value or raw user response",
  "lead_score": "hot" | "warm" | "cold",
  "score_reasoning": "A concise explanation of why this score was given, referencing the matching keywords, timeline, or engagement depth."
}`,
      },
      {
        role: 'user',
        content: `Question asked: "${questionPrompt}"\nUser response: "${message}"`,
      },
    ];

    const result = await getAIResponse(extractionMessages, aiConfig);
    
    let extractedVal = message;
    let leadScore = 'cold';
    let scoreReasoning = 'Lead evaluated automatically.';

    try {
      const content = result.content?.trim() || '';
      const startIdx = content.indexOf('{');
      const endIdx = content.lastIndexOf('}');
      if (startIdx !== -1 && endIdx !== -1) {
        const jsonStr = content.slice(startIdx, endIdx + 1);
        const parsed = JSON.parse(jsonStr);
        extractedVal = parsed.extracted_value?.trim() || message;
        leadScore = parsed.lead_score || 'cold';
        scoreReasoning = parsed.score_reasoning || 'Evaluated automatically.';
      } else {
        extractedVal = content || message;
      }
    } catch (e) {
      console.warn('Failed to parse JSON response in extractValue:', e.message);
      extractedVal = result.content?.trim() || message;
    }

    const validation = validateField(questionId, extractedVal, phoneFormat);

    if (!validation.is_valid) {
      let botReply = `That doesn't look like a valid ${questionLabel} — mind double-checking it?`;
      if (questionId === 'email' || questionId.toLowerCase().includes('email')) {
        botReply = `That doesn't look like a valid email — mind double-checking it?`;
      } else if (questionId === 'phone' || questionId.toLowerCase().includes('phone')) {
        const desc = phoneFormat === 'IN' ? '10-digit Indian mobile number' : '10-digit phone number';
        botReply = `That doesn't look like a valid phone number. Please provide a valid ${desc}.`;
      }

      return {
        field_being_collected: questionId,
        value_provided: extractedVal,
        is_valid: false,
        reason: validation.reason,
        bot_reply: botReply,
        lead_score: leadScore,
        score_reasoning: scoreReasoning
      };
    }

    return {
      field_being_collected: questionId,
      value_provided: extractedVal,
      is_valid: true,
      lead_score: leadScore,
      score_reasoning: scoreReasoning
    };
  } catch (err) {
    console.error('Value extraction failed:', err);
    return {
      field_being_collected: questionId,
      value_provided: message,
      is_valid: true,
      lead_score: 'cold',
      score_reasoning: 'Evaluation failed on server error.'
    };
  }
}

/**
 * Detects if the user is attempting to correct a previously provided field
 */
async function classifyCorrection(message, collectedFields, aiConfig) {
  try {
    const prompt = `You are a conversation correction-detection engine.
Your task is to identify if the user's message is a clear attempt to correct, change, or update a field that they have already provided.
The fields they have provided so far: ${collectedFields.join(', ')}.

STRICT RULES:
1. If they want to correct one of these fields (e.g. "actually my email is...", "change my phone to..."), return a JSON object with:
{
  "is_correction": true,
  "field": "name of the field being corrected (matching one of: ${collectedFields.join(', ')})"
}
2. If they are NOT correcting a field, return:
{
  "is_correction": false
}
3. Output ONLY a valid JSON object. No explanation, no markup (no \`\`\`json).`;

    const messages = [
      { role: 'system', content: prompt },
      { role: 'user', content: `User message: "${message}"` }
    ];

    const res = await getAIResponse(messages, aiConfig);
    let content = res.content?.trim() || '';
    if (content.startsWith('```')) {
      content = content.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
    }
    const parsed = JSON.parse(content);
    if (parsed.is_correction && collectedFields.includes(parsed.field)) {
      return parsed;
    }
  } catch (err) {
    console.error('Correction classification error:', err.message);
  }
  return { is_correction: false };
}

/**
 * Checks if the user is confirming the summary with a yes/agree
 */
async function classifyConfirmation(message, aiConfig) {
  try {
    const prompt = `Classify if the user is confirming or agreeing with the correctness of information (answering "yes", "looks good", "correct", etc.).
Respond with ONLY the word YES if they are agreeing/confirming.
Respond with ONLY the word NO if they are disagreeing, saying no, trying to correct something, or saying something else.
Do not output anything else.`;

    const messages = [
      { role: 'system', content: prompt },
      { role: 'user', content: `User message: "${message}"` }
    ];

    const res = await getAIResponse(messages, aiConfig);
    const content = res.content?.trim().toUpperCase();
    return content === 'YES';
  } catch (err) {
    console.error('Confirmation classification failed, using regex fallback:', err.message);
    return /^(yes|yeah|yep|y|correct|sure|confirm|ok|okay|looks good|indeed)$/i.test(message.trim());
  }
}

/**
 * Handles conversational lead collection flow.
 * Returns true if this message was consumed by the lead flow (no further normal chat needed).
 * Returns false if normal AI chat should handle the message.
 */
async function handleLeadCollection(chatbot, conversation, message, res, isStreaming, decryptedConfig, currentSessionId, history) {
  let questions = [];
  try {
    questions = JSON.parse(chatbot.leadQuestions || '[]');
  } catch (e) {
    console.error('Failed to parse lead questions:', e);
  }

  if (questions.length === 0) return false;

  let collected = {};
  try {
    collected = JSON.parse(conversation.collectedData || '{}');
  } catch (e) {}
  const collectedFields = Object.keys(collected);

  // Check for correction intent first (can happen during collecting or confirming)
  if (collectedFields.length > 0 && conversation.leadStatus !== 'inactive') {
    const correctionResult = await classifyCorrection(message.trim(), collectedFields, decryptedConfig);
    if (correctionResult.is_correction) {
      const fieldId = correctionResult.field;
      const targetQIndex = questions.findIndex(q => (q.id === fieldId || q.label === fieldId));

      if (targetQIndex !== -1) {
        const targetQuestion = questions[targetQIndex];
        // Try extracting value from the correction sentence
        const extraction = await extractValue(
          message.trim(),
          targetQuestion.id,
          targetQuestion.label,
          targetQuestion.question,
          decryptedConfig,
          chatbot.leadPhoneFormat || 'IN',
          chatbot.leadScoringRules ? JSON.parse(chatbot.leadScoringRules) : {},
          history,
          collected
        );

        if (extraction.is_valid) {
          collected[targetQuestion.id || targetQuestion.label] = extraction.value_provided;
          const newCollectedDataStr = JSON.stringify(collected);

          // If all questions are answered, return to confirming state
          const allAnswered = questions.every(q => collected[q.id || q.label] !== undefined);
          if (allAnswered) {
            await prisma.conversation.update({
              where: { id: conversation.id },
              data: {
                leadStatus: 'confirming',
                collectedData: newCollectedDataStr,
                leadScore: extraction.lead_score,
                scoreReasoning: extraction.score_reasoning,
                updatedAt: new Date()
              }
            });

            const summaryLines = Object.entries(collected)
              .map(([k, v]) => `- **${k}**: ${v}`)
              .join('\n');
            const reply = `I've updated your ${targetQuestion.label} to "${extraction.value_provided}".\n\nHere is the updated information:\n${summaryLines}\n\nIs this correct? (Reply "yes" to confirm).`;

            const assistantMessage = await prisma.message.create({
              data: { role: 'assistant', content: reply, conversationId: conversation.id },
            });

            if (isStreaming) {
              res.write(`data: ${JSON.stringify({ type: 'start', sessionId: currentSessionId, conversationId: conversation.id })}\n\n`);
              res.write(`data: ${JSON.stringify({ type: 'chunk', content: reply })}\n\n`);
              res.write(`data: ${JSON.stringify({ type: 'done', messageId: assistantMessage.id })}\n\n`);
              res.end();
            } else {
              res.json({ reply, sessionId: currentSessionId, messageId: assistantMessage.id, conversationId: conversation.id });
            }
            return true;
          } else {
            // Find next unanswered question
            const nextUnansweredIdx = questions.findIndex(q => collected[q.id || q.label] === undefined);
            await prisma.conversation.update({
              where: { id: conversation.id },
              data: {
                leadStatus: 'collecting',
                currentQuestionIndex: nextUnansweredIdx,
                collectedData: newCollectedDataStr,
                leadScore: extraction.lead_score,
                scoreReasoning: extraction.score_reasoning,
                updatedAt: new Date()
              }
            });

            const nextQ = questions[nextUnansweredIdx];
            const reply = `I've updated your ${targetQuestion.label} to "${extraction.value_provided}".\n\nNext: ${nextQ.question}`;
            const assistantMessage = await prisma.message.create({
              data: { role: 'assistant', content: reply, conversationId: conversation.id },
            });

            if (isStreaming) {
              res.write(`data: ${JSON.stringify({ type: 'start', sessionId: currentSessionId, conversationId: conversation.id })}\n\n`);
              res.write(`data: ${JSON.stringify({ type: 'chunk', content: reply })}\n\n`);
              res.write(`data: ${JSON.stringify({ type: 'done', messageId: assistantMessage.id })}\n\n`);
              res.end();
            } else {
              res.json({ reply, sessionId: currentSessionId, messageId: assistantMessage.id, conversationId: conversation.id });
            }
            return true;
          }
        } else {
          // Remove field and ask for it specifically
          delete collected[targetQuestion.id || targetQuestion.label];
          await prisma.conversation.update({
            where: { id: conversation.id },
            data: {
              leadStatus: 'collecting',
              currentQuestionIndex: targetQIndex,
              collectedData: JSON.stringify(collected),
              updatedAt: new Date()
            }
          });

          const reply = `Understood. Let's correct your ${targetQuestion.label}.\n\n${targetQuestion.question}`;
          const assistantMessage = await prisma.message.create({
            data: { role: 'assistant', content: reply, conversationId: conversation.id },
          });

          if (isStreaming) {
            res.write(`data: ${JSON.stringify({ type: 'start', sessionId: currentSessionId, conversationId: conversation.id })}\n\n`);
            res.write(`data: ${JSON.stringify({ type: 'chunk', content: reply })}\n\n`);
            res.write(`data: ${JSON.stringify({ type: 'done', messageId: assistantMessage.id })}\n\n`);
            res.end();
          } else {
            res.json({ reply, sessionId: currentSessionId, messageId: assistantMessage.id, conversationId: conversation.id });
          }
          return true;
        }
      }
    }
  }

  // ── CASE 1: Confirming State — handle yes/no confirmation ──
  if (conversation.leadStatus === 'confirming') {
    const isConfirmed = await classifyConfirmation(message.trim(), decryptedConfig);
    if (isConfirmed) {
      // Finalize and create the Lead row
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { leadStatus: 'completed', updatedAt: new Date() },
      });

      const collectedDataStr = JSON.stringify(collected);
      const lead = await prisma.lead.upsert({
        where: { conversationId: conversation.id },
        update: {
          details: collectedDataStr,
          status: 'completed',
          isComplete: true,
          leadScore: conversation.leadScore || 'cold',
          scoreReasoning: conversation.scoreReasoning || 'Lead confirmed details.'
        },
        create: {
          chatbotId: chatbot.id,
          conversationId: conversation.id,
          details: collectedDataStr,
          status: 'completed',
          isComplete: true,
          leadScore: conversation.leadScore || 'cold',
          scoreReasoning: conversation.scoreReasoning || 'Lead confirmed details.'
        },
      });

      if (chatbot.webhookUrl) {
        triggerWebhook(chatbot.webhookUrl, {
          event: 'lead.captured',
          leadId: lead.id,
          chatbotId: chatbot.id,
          chatbotName: chatbot.name,
          conversationId: conversation.id,
          details: collected,
          createdAt: lead.createdAt,
        }).catch(err => console.error('Webhook fire error:', err));
      }

      const thankYouPrompt = [
        {
          role: 'system',
          content: `The lead collection is complete and confirmed. Politely thank the user for providing their details and let them know we will get back to them. If they have any other questions, they can ask.`,
        },
        { role: 'user', content: message.trim() },
      ];

      if (isStreaming) {
        const startTime = Date.now();
        let fullContent = '';
        const aiResult = await aiQueue.add(() =>
          getAIResponseStreaming(thankYouPrompt, decryptedConfig, (chunk) => {
            fullContent += chunk;
            res.write(`data: ${JSON.stringify({ type: 'chunk', content: chunk })}\n\n`);
          })
        );
        const responseTimeMs = Date.now() - startTime;
        const assistantMessage = await prisma.message.create({
          data: { role: 'assistant', content: aiResult.content || fullContent, tokenCount: aiResult.tokenCount || 0, responseTimeMs, conversationId: conversation.id },
        });
        res.write(`data: ${JSON.stringify({ type: 'done', messageId: assistantMessage.id, tokenCount: aiResult.tokenCount || 0, responseTimeMs })}\n\n`);
        res.end();
      } else {
        const startTime = Date.now();
        const aiResult = await aiQueue.add(() => getAIResponse(thankYouPrompt, decryptedConfig));
        const responseTimeMs = Date.now() - startTime;
        const assistantMessage = await prisma.message.create({
          data: { role: 'assistant', content: aiResult.content, tokenCount: aiResult.tokenCount, responseTimeMs, conversationId: conversation.id },
        });
        res.json({ reply: aiResult.content, sessionId: currentSessionId, messageId: assistantMessage.id, conversationId: conversation.id });
      }
      return true;
    } else {
      // Did not confirm
      const reply = `I didn't quite catch that. Is the information listed above correct? Please reply "yes" to confirm, or tell me which field you would like to correct.`;
      const assistantMessage = await prisma.message.create({
        data: { role: 'assistant', content: reply, conversationId: conversation.id },
      });

      if (isStreaming) {
        res.write(`data: ${JSON.stringify({ type: 'start', sessionId: currentSessionId, conversationId: conversation.id })}\n\n`);
        res.write(`data: ${JSON.stringify({ type: 'chunk', content: reply })}\n\n`);
        res.write(`data: ${JSON.stringify({ type: 'done', messageId: assistantMessage.id })}\n\n`);
        res.end();
      } else {
        res.json({ reply, sessionId: currentSessionId, messageId: assistantMessage.id, conversationId: conversation.id });
      }
      return true;
    }
  }

  // ── CASE 2: Collecting State — process the answer for the current question ──
  if (conversation.leadStatus === 'collecting') {
    const currentQuestion = questions[conversation.currentQuestionIndex];
    if (!currentQuestion) {
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { leadStatus: 'confirming', updatedAt: new Date() },
      });
      return false;
    }

    const extractionResult = await extractValue(
      message.trim(),
      currentQuestion.id,
      currentQuestion.label,
      currentQuestion.question,
      decryptedConfig,
      chatbot.leadPhoneFormat || 'IN',
      chatbot.leadScoringRules ? JSON.parse(chatbot.leadScoringRules) : {},
      history,
      collected
    );

    if (!extractionResult.is_valid) {
      // Re-ask the same question without advancing index or saving
      const assistantMessage = await prisma.message.create({
        data: { role: 'assistant', content: extractionResult.bot_reply, conversationId: conversation.id },
      });

      if (isStreaming) {
        res.write(`data: ${JSON.stringify({ type: 'start', sessionId: currentSessionId, conversationId: conversation.id })}\n\n`);
        res.write(`data: ${JSON.stringify({ type: 'chunk', content: extractionResult.bot_reply })}\n\n`);
        res.write(`data: ${JSON.stringify({ type: 'done', messageId: assistantMessage.id, leadField: currentQuestion.id, leadLabel: currentQuestion.label })}\n\n`);
        res.end();
      } else {
        res.json({
          reply: extractionResult.bot_reply,
          sessionId: currentSessionId,
          messageId: assistantMessage.id,
          conversationId: conversation.id,
          leadField: currentQuestion.id,
          leadLabel: currentQuestion.label,
        });
      }
      return true;
    }

    // Valid extraction: save to collectedData
    collected[currentQuestion.id || currentQuestion.label] = extractionResult.value_provided;
    const collectedDataStr = JSON.stringify(collected);
    const nextIndex = conversation.currentQuestionIndex + 1;

    if (nextIndex < questions.length) {
      // Ask next question
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          currentQuestionIndex: nextIndex,
          collectedData: collectedDataStr,
          leadScore: extractionResult.lead_score,
          scoreReasoning: extractionResult.score_reasoning,
          updatedAt: new Date(),
        },
      });

      const nextQuestion = questions[nextIndex];
      const assistantMessage = await prisma.message.create({
        data: { role: 'assistant', content: nextQuestion.question, conversationId: conversation.id },
      });

      if (isStreaming) {
        res.write(`data: ${JSON.stringify({ type: 'start', sessionId: currentSessionId, conversationId: conversation.id })}\n\n`);
        res.write(`data: ${JSON.stringify({ type: 'chunk', content: nextQuestion.question })}\n\n`);
        res.write(`data: ${JSON.stringify({ type: 'done', messageId: assistantMessage.id, leadField: nextQuestion.id, leadLabel: nextQuestion.label, leadOptions: nextQuestion.options || [] })}\n\n`);
        res.end();
      } else {
        res.json({
          reply: nextQuestion.question,
          sessionId: currentSessionId,
          messageId: assistantMessage.id,
          conversationId: conversation.id,
          leadField: nextQuestion.id,
          leadLabel: nextQuestion.label,
          leadOptions: nextQuestion.options || [],
        });
      }
      return true;
    } else {
      // All questions answered -> transition to confirming state (NO lead row created yet!)
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          leadStatus: 'confirming',
          collectedData: collectedDataStr,
          leadScore: extractionResult.lead_score,
          scoreReasoning: extractionResult.score_reasoning,
          updatedAt: new Date(),
        },
      });

      const summaryLines = Object.entries(collected)
        .map(([k, v]) => `- **${k}**: ${v}`)
        .join('\n');
      const confirmMsg = `Thanks! Here is the information I've collected:\n\n${summaryLines}\n\nIs this correct? (Reply "yes" to confirm).`;

      const assistantMessage = await prisma.message.create({
        data: { role: 'assistant', content: confirmMsg, conversationId: conversation.id },
      });

      if (isStreaming) {
        res.write(`data: ${JSON.stringify({ type: 'start', sessionId: currentSessionId, conversationId: conversation.id })}\n\n`);
        res.write(`data: ${JSON.stringify({ type: 'chunk', content: confirmMsg })}\n\n`);
        res.write(`data: ${JSON.stringify({ type: 'done', messageId: assistantMessage.id })}\n\n`);
        res.end();
      } else {
        res.json({
          reply: confirmMsg,
          sessionId: currentSessionId,
          messageId: assistantMessage.id,
          conversationId: conversation.id,
        });
      }
      return true;
    }
  }

  // ── CASE 3: Inactive State — check trigger conditions ──
  if (conversation.leadStatus === 'inactive' && chatbot.leadCollectionEnabled) {
    let shouldTrigger = false;
    const mode = chatbot.leadTriggerMode || 'intent_only';

    if (mode === 'turn_threshold') {
      const userMessageCount = history.filter(m => m.role === 'user').length + 1; // Include current message
      if (userMessageCount >= (chatbot.leadTurnThreshold || 3)) {
        shouldTrigger = true;
      }
    } else if (mode === 'intent_only') {
      const isLeadIntent = await classifyIntent(
        message.trim(),
        chatbot.leadTriggerPrompt,
        history,
        decryptedConfig
      );
      if (isLeadIntent) {
        shouldTrigger = true;
      }
    }

    if (shouldTrigger) {
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { leadStatus: 'collecting', currentQuestionIndex: 0, collectedData: '{}', updatedAt: new Date() },
      });

      const firstQuestion = questions[0];
      const assistantMessage = await prisma.message.create({
        data: { role: 'assistant', content: firstQuestion.question, conversationId: conversation.id },
      });

      if (isStreaming) {
        res.write(`data: ${JSON.stringify({ type: 'start', sessionId: currentSessionId, conversationId: conversation.id })}\n\n`);
        res.write(`data: ${JSON.stringify({ type: 'chunk', content: firstQuestion.question })}\n\n`);
        res.write(`data: ${JSON.stringify({ type: 'done', messageId: assistantMessage.id, leadField: firstQuestion.id, leadLabel: firstQuestion.label, leadOptions: firstQuestion.options || [] })}\n\n`);
        res.end();
      } else {
        res.json({
          reply: firstQuestion.question,
          sessionId: currentSessionId,
          messageId: assistantMessage.id,
          conversationId: conversation.id,
          leadField: firstQuestion.id,
          leadLabel: firstQuestion.label,
          leadOptions: firstQuestion.options || [],
        });
      }
      return true;
    }
  }

  return false;
}

// POST /api/chat/message - Non-streaming chat
router.post('/message', async (req, res) => {
  try {
    const { message, sessionId, botId, pageUrl } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Message is required' });
    }

    let chatbotId = botId;
    if (!chatbotId) {
      const defaultBot = await prisma.chatbot.findFirst({ where: { isActive: true } });
      if (!defaultBot) return res.status(404).json({ error: 'No active bot found' });
      chatbotId = defaultBot.id;
    }

    const { chatbot, conversation, currentSessionId, aiMessages, decryptedConfig, history } = await prepareChat(
      message, sessionId, chatbotId, pageUrl, req.ip
    );

    // Intercept for conversational lead collection
    const leadHandled = await handleLeadCollection(
      chatbot, conversation, message, res, false, decryptedConfig, currentSessionId, history
    );
    if (leadHandled) return;

    const startTime = Date.now();
    const aiResult = await aiQueue.add(() => getAIResponse(aiMessages, decryptedConfig));
    const responseTimeMs = Date.now() - startTime;

    const assistantMessage = await prisma.message.create({
      data: {
        role: 'assistant',
        content: aiResult.content,
        tokenCount: aiResult.tokenCount,
        responseTimeMs,
        conversationId: conversation.id,
      },
    });

    res.json({
      reply: aiResult.content,
      sessionId: currentSessionId,
      messageId: assistantMessage.id,
      conversationId: conversation.id,
    });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error('Chat error:', error);
    if (error.message?.includes('timed out')) {
      return res.status(504).json({ error: 'Response timed out. Please try again.' });
    }
    res.status(500).json({ error: 'Failed to get response. Please try again.' });
  }
});

// POST /api/chat/stream - SSE streaming chat
router.post('/stream', async (req, res) => {
  try {
    const { message, sessionId, botId, pageUrl } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Message is required' });
    }

    let chatbotId = botId;
    if (!chatbotId) {
      const defaultBot = await prisma.chatbot.findFirst({ where: { isActive: true } });
      if (!defaultBot) return res.status(404).json({ error: 'No active bot found' });
      chatbotId = defaultBot.id;
    }

    const { chatbot, conversation, currentSessionId, aiMessages, decryptedConfig, history } = await prepareChat(
      message, sessionId, chatbotId, pageUrl, req.ip
    );

    // Set SSE headers BEFORE any writes (including the lead intercept)
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    // Intercept for conversational lead collection (SSE headers already sent)
    const leadHandled = await handleLeadCollection(
      chatbot, conversation, message, res, true, decryptedConfig, currentSessionId, history
    );
    if (leadHandled) return;

    // Normal streaming AI response
    res.write(`data: ${JSON.stringify({ type: 'start', sessionId: currentSessionId, conversationId: conversation.id })}\n\n`);

    const startTime = Date.now();
    let fullContent = '';

    const aiResult = await aiQueue.add(() =>
      getAIResponseStreaming(aiMessages, decryptedConfig, (chunk) => {
        fullContent += chunk;
        res.write(`data: ${JSON.stringify({ type: 'chunk', content: chunk })}\n\n`);
      })
    );

    const responseTimeMs = Date.now() - startTime;

    const assistantMessage = await prisma.message.create({
      data: {
        role: 'assistant',
        content: aiResult.content || fullContent,
        tokenCount: aiResult.tokenCount || 0,
        responseTimeMs,
        conversationId: conversation.id,
      },
    });

    res.write(`data: ${JSON.stringify({
      type: 'done',
      messageId: assistantMessage.id,
      tokenCount: aiResult.tokenCount || 0,
      responseTimeMs,
    })}\n\n`);

    res.end();
  } catch (error) {
    if (error.status) {
      if (!res.headersSent) return res.status(error.status).json({ error: error.message });
    }
    console.error('Stream error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Streaming failed' });
    } else {
      res.write(`data: ${JSON.stringify({ type: 'error', error: 'Streaming failed' })}\n\n`);
      res.end();
    }
  }
});

// GET /api/chat/conversations/:chatbotId - List conversations for a chatbot (admin)
router.get('/conversations/:chatbotId', authMiddleware, async (req, res) => {
  try {
    const { chatbotId } = req.params;
    const { page = 1, limit = 20, status } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const chatbot = await prisma.chatbot.findFirst({
      where: { id: chatbotId, adminId: req.admin.id },
    });
    if (!chatbot) return res.status(404).json({ error: 'Chatbot not found' });

    const where = { chatbotId };
    if (status) where.status = status;

    const [conversations, total] = await Promise.all([
      prisma.conversation.findMany({
        where,
        include: {
          messages: { orderBy: { createdAt: 'desc' }, take: 1 },
          _count: { select: { messages: true } },
        },
        orderBy: { updatedAt: 'desc' },
        skip,
        take: parseInt(limit),
      }),
      prisma.conversation.count({ where }),
    ]);

    res.json({
      conversations,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit)),
    });
  } catch (error) {
    console.error('List conversations error:', error);
    res.status(500).json({ error: 'Failed to list conversations' });
  }
});

// GET /api/chat/conversation/:id - Get conversation detail
router.get('/conversation/:id', authMiddleware, async (req, res) => {
  try {
    const conversation = await prisma.conversation.findUnique({
      where: { id: req.params.id },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
        chatbot: { select: { adminId: true, name: true, leadQuestions: true } },
        lead: true,
      },
    });

    if (!conversation) return res.status(404).json({ error: 'Conversation not found' });
    if (conversation.chatbot.adminId !== req.admin.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(conversation);
  } catch (error) {
    console.error('Get conversation error:', error);
    res.status(500).json({ error: 'Failed to get conversation' });
  }
});

// POST /api/chat/conversation/:id/trigger-lead - Manually trigger lead qualification (from Conversations list)
router.post('/conversation/:id/trigger-lead', authMiddleware, async (req, res) => {
  try {
    const conversation = await prisma.conversation.findUnique({
      where: { id: req.params.id },
      include: { chatbot: true }
    });

    if (!conversation) return res.status(404).json({ error: 'Conversation not found' });
    if (conversation.chatbot.adminId !== req.admin.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    let questions = [];
    try {
      questions = JSON.parse(conversation.chatbot.leadQuestions || '[]');
    } catch (e) {}

    if (questions.length === 0) {
      return res.status(400).json({ error: 'No lead questions configured for this chatbot' });
    }

    // Force lead status to collecting, and set question index to 0
    const updatedConv = await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        leadStatus: 'collecting',
        currentQuestionIndex: 0,
        collectedData: '{}',
        updatedAt: new Date()
      }
    });

    // Create the assistant message with the first question
    const firstQ = questions[0];
    const assistantMessage = await prisma.message.create({
      data: { role: 'assistant', content: firstQ.question, conversationId: conversation.id }
    });

    res.json({
      message: 'Lead collection triggered successfully',
      conversation: updatedConv,
      firstQuestion: firstQ.question,
      messageId: assistantMessage.id
    });
  } catch (error) {
    console.error('Trigger lead capture error:', error);
    res.status(500).json({ error: 'Failed to trigger lead capture' });
  }
});

// Background job to clean up abandoned sessions and save incomplete leads
setInterval(async () => {
  try {
    const INACTIVITY_TIMEOUT = 10 * 60 * 1000; // 10 minutes
    const threshold = new Date(Date.now() - INACTIVITY_TIMEOUT);

    const abandonedConversations = await prisma.conversation.findMany({
      where: {
        leadStatus: { in: ['collecting', 'confirming'] },
        updatedAt: { lt: threshold }
      },
      include: {
        lead: true
      }
    });

    for (const conv of abandonedConversations) {
      let collected = {};
      try {
        collected = JSON.parse(conv.collectedData || '{}');
      } catch (e) {}

      // Only create an incomplete lead if some fields have been collected
      if (Object.keys(collected).length > 0) {
        await prisma.lead.upsert({
          where: { conversationId: conv.id },
          update: {
            details: conv.collectedData,
            status: 'incomplete'
          },
          create: {
            chatbotId: conv.chatbotId,
            conversationId: conv.id,
            details: conv.collectedData,
            status: 'incomplete'
          }
        });
      }

      // Update conversation state to completed (since we've processed it)
      await prisma.conversation.update({
        where: { id: conv.id },
        data: {
          leadStatus: 'completed',
          updatedAt: new Date()
        }
      });

      console.log(`[Auto-Lead] Captured incomplete lead for conversation ${conv.id} due to inactivity.`);
    }
  } catch (err) {
    console.error('[Auto-Lead] Background job failed:', err);
  }
}, 60 * 1000); // Check every minute

module.exports = router;
