const express = require('express');
const prisma = require('../lib/prisma');
const { authMiddleware } = require('../lib/auth');
const https = require('https');
const http = require('http');

const router = express.Router();
router.use(authMiddleware);

/**
 * Helper to dispatch webhook payload
 */
async function triggerWebhook(url, payload) {
  if (!url) return { error: 'No webhook URL provided' };
  return new Promise((resolve) => {
    try {
      const parsedUrl = new URL(url);
      const client = parsedUrl.protocol === 'https:' ? https : http;
      const body = JSON.stringify(payload);
      
      const req = client.request({
        hostname: parsedUrl.hostname,
        port: parsedUrl.port,
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
        timeout: 10000,
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          resolve({ status: res.statusCode, data });
        });
      });

      req.on('error', (err) => {
        console.error('Webhook error:', err);
        resolve({ error: err.message });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({ error: 'Webhook timeout' });
      });

      req.write(body);
      req.end();
    } catch (err) {
      console.error('Webhook parsing error:', err);
      resolve({ error: err.message });
    }
  });
}

// GET /api/leads/:botId - List paginated leads for a chatbot with search
router.get('/:botId', async (req, res) => {
  try {
    const { botId } = req.params;
    const { page = 1, limit = 20, search = '' } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Verify ownership
    const chatbot = await prisma.chatbot.findFirst({
      where: { id: botId, adminId: req.admin.id },
    });
    if (!chatbot) return res.status(404).json({ error: 'Chatbot not found' });

    // Fetch leads
    const where = { chatbotId: botId };
    
    if (search.trim()) {
      where.OR = [
        { details: { contains: search, mode: 'insensitive' } },
        { conversation: { visitorName: { contains: search, mode: 'insensitive' } } }
      ];
    }

    const [leads, total] = await Promise.all([
      prisma.lead.findMany({
        where,
        include: {
          conversation: {
            select: { visitorName: true, sessionId: true }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit),
      }),
      prisma.lead.count({ where }),
    ]);

    res.json({
      leads,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit)),
    });
  } catch (error) {
    console.error('List leads error:', error);
    res.status(500).json({ error: 'Failed to list leads' });
  }
});

// POST /api/leads/:botId - Manually create a lead (from Inbox)
router.post('/:botId', async (req, res) => {
  try {
    const { botId } = req.params;
    const { conversationId, details } = req.body;

    if (!details) {
      return res.status(400).json({ error: 'Lead details are required' });
    }

    // Verify chatbot ownership
    const chatbot = await prisma.chatbot.findFirst({
      where: { id: botId, adminId: req.admin.id },
    });
    if (!chatbot) return res.status(404).json({ error: 'Chatbot not found' });

    // Verify conversation if provided
    if (conversationId) {
      const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
      });
      if (!conversation || conversation.chatbotId !== botId) {
        return res.status(400).json({ error: 'Invalid conversation ID' });
      }
    }

    // Create lead
    const detailsStr = typeof details === 'string' ? details : JSON.stringify(details);
    const lead = await prisma.lead.create({
      data: {
        chatbotId: botId,
        conversationId: conversationId || null,
        details: detailsStr,
      },
      include: {
        conversation: { select: { visitorName: true } }
      }
    });

    // Update conversation state if associated
    if (conversationId) {
      await prisma.conversation.update({
        where: { id: conversationId },
        data: {
          leadStatus: 'completed',
          collectedData: detailsStr,
          updatedAt: new Date(),
        }
      });
    }

    // Trigger Webhook if configured
    if (chatbot.webhookUrl) {
      triggerWebhook(chatbot.webhookUrl, {
        event: 'lead.created_manually',
        leadId: lead.id,
        chatbotId: botId,
        chatbotName: chatbot.name,
        conversationId: conversationId || null,
        details: typeof details === 'string' ? JSON.parse(details) : details,
        createdAt: lead.createdAt
      }).catch(err => console.error('Webhook manual trigger failed:', err));
    }

    res.status(201).json(lead);
  } catch (error) {
    console.error('Create lead error:', error);
    res.status(500).json({ error: 'Failed to create lead' });
  }
});

// PUT /api/leads/:botId/:leadId - Update lead details
router.put('/:botId/:leadId', async (req, res) => {
  try {
    const { botId, leadId } = req.params;
    const { details } = req.body;

    if (!details) {
      return res.status(400).json({ error: 'Lead details are required' });
    }

    // Verify chatbot ownership
    const chatbot = await prisma.chatbot.findFirst({
      where: { id: botId, adminId: req.admin.id },
    });
    if (!chatbot) return res.status(404).json({ error: 'Chatbot not found' });

    // Verify lead exists and belongs to bot
    const existingLead = await prisma.lead.findFirst({
      where: { id: leadId, chatbotId: botId },
    });
    if (!existingLead) return res.status(404).json({ error: 'Lead not found' });

    const detailsStr = typeof details === 'string' ? details : JSON.stringify(details);
    const lead = await prisma.lead.update({
      where: { id: leadId },
      data: { details: detailsStr },
      include: { conversation: { select: { visitorName: true } } }
    });

    // If there is an associated conversation, synchronize the collectedData field
    if (lead.conversationId) {
      await prisma.conversation.update({
        where: { id: lead.conversationId },
        data: { collectedData: detailsStr }
      });
    }

    // Send webhook updates
    if (chatbot.webhookUrl) {
      triggerWebhook(chatbot.webhookUrl, {
        event: 'lead.updated',
        leadId: lead.id,
        chatbotId: botId,
        chatbotName: chatbot.name,
        conversationId: lead.conversationId,
        details: typeof details === 'string' ? JSON.parse(details) : details,
        updatedAt: lead.updatedAt
      }).catch(err => console.error('Webhook update notify failed:', err));
    }

    res.json(lead);
  } catch (error) {
    console.error('Update lead error:', error);
    res.status(500).json({ error: 'Failed to update lead' });
  }
});

// DELETE /api/leads/:botId/:leadId - Delete lead
router.delete('/:botId/:leadId', async (req, res) => {
  try {
    const { botId, leadId } = req.params;

    // Verify chatbot ownership
    const chatbot = await prisma.chatbot.findFirst({
      where: { id: botId, adminId: req.admin.id },
    });
    if (!chatbot) return res.status(404).json({ error: 'Chatbot not found' });

    // Verify lead
    const lead = await prisma.lead.findFirst({
      where: { id: leadId, chatbotId: botId },
    });
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    // Delete lead
    await prisma.lead.delete({ where: { id: leadId } });

    // Reset conversation leadStatus if it was completed
    if (lead.conversationId) {
      await prisma.conversation.update({
        where: { id: lead.conversationId },
        data: {
          leadStatus: 'inactive',
          currentQuestionIndex: 0,
          collectedData: '{}',
        }
      }).catch(() => {}); // ignore error if conversation deleted
    }

    res.json({ message: 'Lead deleted successfully' });
  } catch (error) {
    console.error('Delete lead error:', error);
    res.status(500).json({ error: 'Failed to delete lead' });
  }
});

// POST /api/leads/:botId/:leadId/webhook - Manually dispatch webhook again
router.post('/:botId/:leadId/webhook', async (req, res) => {
  try {
    const { botId, leadId } = req.params;

    // Verify chatbot ownership
    const chatbot = await prisma.chatbot.findFirst({
      where: { id: botId, adminId: req.admin.id },
    });
    if (!chatbot) return res.status(404).json({ error: 'Chatbot not found' });
    if (!chatbot.webhookUrl) return res.status(400).json({ error: 'No webhook URL configured for this chatbot' });

    // Verify lead
    const lead = await prisma.lead.findFirst({
      where: { id: leadId, chatbotId: botId },
    });
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    let detailsJson = {};
    try {
      detailsJson = JSON.parse(lead.details || '{}');
    } catch(e) {}

    const result = await triggerWebhook(chatbot.webhookUrl, {
      event: 'lead.webhook_retry',
      leadId: lead.id,
      chatbotId: botId,
      chatbotName: chatbot.name,
      conversationId: lead.conversationId,
      details: detailsJson,
      createdAt: lead.createdAt,
      dispatchedAt: new Date()
    });

    if (result.error) {
      return res.status(502).json({ error: `Webhook dispatch failed: ${result.error}` });
    }

    res.json({ message: 'Webhook dispatched successfully', status: result.status, response: result.data });
  } catch (error) {
    console.error('Manual webhook dispatch error:', error);
    res.status(500).json({ error: 'Failed to dispatch webhook' });
  }
});

module.exports = router;
