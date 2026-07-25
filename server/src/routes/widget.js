const express = require('express');
const prisma = require('../lib/prisma');

const router = express.Router();

// GET /widget/config/:botId
router.get('/config/:botId', async (req, res) => {
  try {
    const chatbot = await prisma.chatbot.findUnique({
      where: { id: req.params.botId },
      select: { id: true, name: true, welcomeMessage: true, primaryColor: true, position: true, isActive: true, widgetTheme: true, voiceConfig: true },
    });
    if (!chatbot || !chatbot.isActive) {
      return res.status(404).json({ error: 'Bot not found or inactive' });
    }
    res.json(chatbot);
  } catch (error) {
    console.error('Widget config error:', error);
    res.status(500).json({ error: 'Failed to get widget config' });
  }
});

// GET /widget/config
router.get('/config', async (req, res) => {
  try {
    const chatbot = await prisma.chatbot.findFirst({
      where: { isActive: true },
      select: { id: true, name: true, welcomeMessage: true, primaryColor: true, position: true, isActive: true, widgetTheme: true, voiceConfig: true },
    });
    if (!chatbot) return res.status(404).json({ error: 'No active bot found' });
    res.json(chatbot);
  } catch (error) {
    console.error('Widget config error:', error);
    res.status(500).json({ error: 'Failed to get widget config' });
  }
});

// POST /widget/feedback — save conversation rating
router.post('/feedback', async (req, res) => {
  try {
    const { sessionId, botId, rating, label, comment } = req.body;
    if (!sessionId) return res.status(400).json({ error: 'sessionId required' });

    const conversation = await prisma.conversation.findFirst({
      where: { sessionId, ...(botId ? { chatbotId: botId } : {}), status: 'active' },
      orderBy: { createdAt: 'desc' },
    });

    if (conversation) {
      let existing = {};
      try { existing = JSON.parse(conversation.collectedData || '{}'); } catch (_) {}
      existing.__feedback = {
        rating: rating ? parseInt(rating) : null,
        label: label || 'Skipped',
        comment: comment || '',
        submittedAt: new Date().toISOString()
      };
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { collectedData: JSON.stringify(existing), updatedAt: new Date() },
      });
    }

    res.json({ ok: true });
  } catch (error) {
    console.error('Feedback save error:', error);
    res.status(500).json({ error: 'Failed to save feedback' });
  }
});

// GET /widget/embed.js - Embeddable widget with STREAMING support
router.get('/embed.js', (req, res) => {
  const serverUrl = `${req.protocol}://${req.get('host')}`;

  const widgetScript = `
(function() {
  if (window.__chatbotWidgetLoaded) return;
  window.__chatbotWidgetLoaded = true;

  function onReady(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
    } else {
      fn();
    }
  }

  function appendToRoot(el) {
    var root = document.body || document.documentElement;
    if (!root) return false;
    try {
      root.appendChild(el);
      return true;
    } catch (e) {}
    try {
      document.documentElement.appendChild(el);
      return true;
    } catch (e) {}
    try {
      document.body.appendChild(el);
      return true;
    } catch (e) {}
    try {
      document.documentElement.insertBefore(el, document.documentElement.firstChild);
      return true;
    } catch (e) {}
    return false;
  }

  function addToRoot(el) {
    if (appendToRoot(el)) return;
    try {
      if (document.documentElement) document.documentElement.insertBefore(el, document.documentElement.firstChild);
    } catch (e) {
      try { document.body && document.body.appendChild(el); } catch (_e) {}
    }
  }

  onReady(function() {
    var scriptTag = document.currentScript || document.querySelector('script[data-chatbot-id]');
    var SERVER_URL = '${serverUrl}';
    if (scriptTag && scriptTag.src) {
      try {
        SERVER_URL = new URL(scriptTag.src, window.location.href).origin;
      } catch (e) {
        // fallback to server URL from embed endpoint
      }
    }
    var botId = scriptTag ? scriptTag.getAttribute('data-chatbot-id') : null;

  var sessionKey = 'chatbot_session_' + (botId || 'default');
  var sessionId = null;
  function safeGetStorage(key) {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }
  function safeSetStorage(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      return false;
    }
    return true;
  }
  sessionId = safeGetStorage(sessionKey);
  if (!sessionId) {
    sessionId = 'sess_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
    safeSetStorage(sessionKey, sessionId);
  }

  var configUrl = botId ? SERVER_URL + '/widget/config/' + botId : SERVER_URL + '/widget/config';
  var retryPlaceholder = null;
  var pendingConfig = false;

  function createPlaceholder() {
    if (document.getElementById('cb-placeholder-btn')) return;
    try {
      var ph = document.createElement('button');
      ph.type = 'button';
      ph.id = 'cb-placeholder-btn';
      ph.className = 'cb-btn';
      ph.style.cssText = 'width:56px!important;height:56px!important;border-radius:50%!important;position:fixed!important;bottom:20px!important;right:20px!important;z-index:2147483647!important;background:#6366f1!important;color:#ffffff!important;display:flex!important;align-items:center!important;justify-content:center!important;cursor:pointer!important;pointer-events:auto!important;';
      ph.title = 'Loading chat widget...';
      ph.innerHTML = '<svg viewBox="0 0 24 24" style="width:22px;height:22px;fill:currentColor;display:block;margin:auto"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/></svg>';
      ph.onclick = function () {
        if (!pendingConfig) {
          pendingConfig = true;
          ph.title = 'Retry loading chat widget';
          loadConfig();
        }
      };
      retryPlaceholder = ph;
      addToRoot(ph);
    } catch (e) {
      /* ignore DOM errors on very restricted pages */
    }
  }

  function removePlaceholder() {
    var ph = document.getElementById('cb-placeholder-btn');
    if (ph) ph.remove();
  }

  function loadConfig() {
    return fetch(configUrl)
      .then(function(r) { return r.json(); })
      .then(function(config) {
        pendingConfig = false;
        if (!config.isActive) return;
        removePlaceholder();
        initWidget(config);
      })
      .catch(function(err) {
        pendingConfig = false;
        console.error('Chatbot widget error:', err);
        if (retryPlaceholder) {
          retryPlaceholder.title = 'Retry loading chat widget';
        }
      });
  }

  createPlaceholder();
  loadConfig();

  function initWidget(config) {
    var theme = {};
    try { theme = JSON.parse(config.widgetTheme || '{}'); } catch(e) {}

    var templates = {
      minimal: {
        primaryColor: '#18181b',
        headerBg: '#ffffff',
        headerText: '#18181b',
        userBubbleBg: '#27272a',
        userBubbleText: '#ffffff',
        botBubbleBg: '#f4f4f5',
        botBubbleText: '#18181b',
        borderRadius: '8px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
        fontFamily: 'system-ui, -apple-system, sans-serif'
      },
      modern_gradient: {
        primaryColor: '#6366f1',
        headerBg: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
        headerText: '#ffffff',
        userBubbleBg: '#6366f1',
        userBubbleText: '#ffffff',
        botBubbleBg: '#f3e8ff',
        botBubbleText: '#1e1b4b',
        borderRadius: '18px',
        boxShadow: '0 10px 30px rgba(99, 102, 241, 0.15)',
        fontFamily: 'system-ui, -apple-system, sans-serif'
      },
      hubspot_default: {
        primaryColor: '#ff7a59',
        headerBg: '#1a1a2e',
        headerText: '#ffffff',
        userBubbleBg: '#ff7a59',
        userBubbleText: '#ffffff',
        botBubbleBg: '#f0f0f0',
        botBubbleText: '#1a1a2e',
        borderRadius: '16px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      },
      corporate: {
        primaryColor: '#0f172a',
        headerBg: '#1e293b',
        headerText: '#ffffff',
        userBubbleBg: '#0284c7',
        userBubbleText: '#ffffff',
        botBubbleBg: '#f8fafc',
        botBubbleText: '#0f172a',
        borderRadius: '0px',
        boxShadow: '0 0 0 1px #e2e8f0, 0 4px 12px rgba(0,0,0,0.05)',
        fontFamily: 'Georgia, serif'
      },
      playful: {
        primaryColor: '#f43f5e',
        headerBg: '#f43f5e',
        headerText: '#ffffff',
        userBubbleBg: '#f43f5e',
        userBubbleText: '#ffffff',
        botBubbleBg: '#ffe4e6',
        botBubbleText: '#881337',
        borderRadius: '24px 24px 4px 24px',
        boxShadow: '0 8px 24px rgba(244, 63, 94, 0.15)',
        fontFamily: 'BlinkMacSystemFont, sans-serif'
      },
      dark_mode: {
        primaryColor: '#38bdf8',
        headerBg: '#0f172a',
        headerText: '#f8fafc',
        userBubbleBg: '#38bdf8',
        userBubbleText: '#0f172a',
        botBubbleBg: '#334155',
        botBubbleText: '#f8fafc',
        borderRadius: '16px',
        boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
        fontFamily: 'system-ui, sans-serif'
      },
      premium_slate: {
        primaryColor: '#0f172a',
        headerBg: '#0f172a',
        headerText: '#f8fafc',
        userBubbleBg: '#0f172a',
        userBubbleText: '#ffffff',
        botBubbleBg: '#ffffff',
        botBubbleText: '#1e293b',
        borderRadius: '14px',
        boxShadow: '0 4px 28px rgba(15,23,42,0.14)',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif'
      },
      clean_ios: {
        primaryColor: '#007AFF',
        headerBg: '#f7f7f8',
        headerText: '#1c1c1e',
        userBubbleBg: '#007AFF',
        userBubbleText: '#ffffff',
        botBubbleBg: '#e9e9eb',
        botBubbleText: '#1c1c1e',
        borderRadius: '20px',
        boxShadow: '0 2px 24px rgba(0,0,0,0.07)',
        fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif'
      },
      saas_elite: {
        primaryColor: '#5046e5',
        headerBg: 'linear-gradient(180deg, #5046e5 0%, #4338ca 100%)',
        headerText: '#ffffff',
        userBubbleBg: '#5046e5',
        userBubbleText: '#ffffff',
        botBubbleBg: '#f5f3ff',
        botBubbleText: '#312e81',
        borderRadius: '16px',
        boxShadow: '0 8px 36px rgba(80,70,229,0.2)',
        fontFamily: 'Inter, system-ui, sans-serif'
      }
    };

    var templateId = theme.templateId || 'modern_gradient';
    var preset = templates[templateId] || templates.modern_gradient;

    var activePrimaryColor = theme.primaryColor || config.primaryColor || preset.primaryColor;
    var activeHeaderBg = (templateId === 'modern_gradient')
      ? 'linear-gradient(135deg, ' + (theme.primaryColor || '#6366f1') + ' 0%, ' + (theme.secondaryColor || '#a855f7') + ' 100%)'
      : (theme.headerBg || preset.headerBg);
    var activeUserBubbleBg = theme.userBubbleColor || activePrimaryColor;
    var activeBotBubbleBg = theme.botBubbleColor || preset.botBubbleBg;
    var activeBorderRadius = preset.borderRadius;
    var activeFont = preset.fontFamily;
    var activeLogo = theme.logoUrl || '';
    var activeLauncherIcon = theme.launcherIconUrl || '';
    var activeStarterQuestions = theme.starterQuestions || [];
    var isDark = templateId === 'dark_mode';

    // Premium Widget Customizations
    var activeBotAvatar = theme.botAvatarUrl || '';
    var enableThinking = theme.enableThinkingAnimation !== false;
    var calloutMsg = theme.calloutMessage || '';
    var calloutDelay = parseInt(theme.calloutDelay) || 3;
    var disclaimerText = theme.disclaimerText || '';
    var inputStyle = theme.inputStyle || 'floating_pill';
    var launcherStyle = theme.launcherStyle || 'default_bubble';
    var launcherPillText = theme.launcherPillText || 'Chat with us';

    // Privacy Policy
    var privacyText = theme.privacyPolicyText || '';
    var privacyUrl = theme.privacyPolicyUrl || '';
    var privacyBannerKey = 'cb_privacy_dismissed_' + (config.id || 'default');

    // Feedback Survey
    var feedbackEnabled = theme.feedbackEnabled !== false;
    var feedbackBadUrl = theme.feedbackBadUrl || '';
    var feedbackNeutralUrl = theme.feedbackNeutralUrl || '';
    var feedbackGoodUrl = theme.feedbackGoodUrl || '';
    var feedbackShown = false;

    // Voice Config
    var voiceObj = {};
    try { voiceObj = JSON.parse(config.voiceConfig || '{}'); } catch(e) {}
    var voiceEnabled = Boolean(voiceObj.enabled);
    var voiceAutoSend = Boolean(voiceObj.autoSend);

    var position = config.position || 'bottom-right';
    var posRight = position.includes('right') ? '20px' : 'auto';
    var posLeft = position.includes('left') ? '20px' : 'auto';

    // ── CSS ─────────────────────────────────────────────────────────────────────
    var style = document.createElement('style');
    style.textContent =
      ':root{' +
      '--cb-primary:' + activePrimaryColor + ';' +
      '--cb-header-bg:' + activeHeaderBg + ';' +
      '--cb-header-text:' + preset.headerText + ';' +
      '--cb-user-bg:' + activeUserBubbleBg + ';' +
      '--cb-user-text:' + preset.userBubbleText + ';' +
      '--cb-bot-bg:' + activeBotBubbleBg + ';' +
      '--cb-bot-text:' + preset.botBubbleText + ';' +
      '--cb-radius:' + activeBorderRadius + ';' +
      '--cb-font:' + activeFont + ';' +
      '--cb-shadow:' + preset.boxShadow + ';' +
      '}' +
      // Launcher button base styles
      '.cb-btn{position:fixed;bottom:20px;right:' + posRight + ';left:' + posLeft + ';background:var(--cb-primary);border:none;cursor:pointer;box-shadow:0 4px 20px rgba(0,0,0,.2);z-index:99998;display:flex;align-items:center;justify-content:center;transition:transform .3s,box-shadow .3s;padding:0;overflow:hidden}' +
      '.cb-btn:hover{transform:scale(1.08);box-shadow:0 8px 28px rgba(0,0,0,.25)}' +
      '.cb-btn svg{width:28px;height:28px;fill:#fff}' +
      // Launcher templates
      '.cb-btn.style-default_bubble{width:60px;height:60px;border-radius:50%}' +
      '.cb-btn.style-glowing_ring{width:60px;height:60px;border-radius:50%}' +
      '.cb-btn.style-glowing_ring::after{content:"";position:absolute;width:100%;height:100%;border-radius:50%;border:2px solid var(--cb-primary);opacity:0;animation:cb-pulse 2s infinite;pointer-events:none;box-sizing:border-box}' +
      '@keyframes cb-pulse{0%{transform:scale(1);opacity:0.8}100%{transform:scale(1.45);opacity:0}}' +
      '.cb-btn.style-sleek_square{width:56px;height:56px;border-radius:14px}' +
      '.cb-btn.style-modern_pill{width:auto;height:48px;border-radius:24px;padding:0 18px;display:flex;align-items:center;gap:8px}' +
      // Widget box
      '.cb-box{position:fixed;bottom:90px;right:' + posRight + ';left:' + posLeft + ';width:380px;max-width:calc(100vw - 40px);height:560px;max-height:calc(100vh - 120px);background:' + (isDark ? '#1e293b' : '#fff') + ';border-radius:var(--cb-radius);box-shadow:var(--cb-shadow);z-index:99999;display:none;flex-direction:column;overflow:hidden;font-family:var(--cb-font)}' +
      '.cb-box.open{display:flex;animation:cb-up .28s cubic-bezier(.22,.68,0,1.2)}' +
      '@keyframes cb-up{from{opacity:0;transform:translateY(24px) scale(.96)}to{opacity:1;transform:translateY(0) scale(1)}}' +
      // Header
      '.cb-hdr{background:var(--cb-header-bg);color:var(--cb-header-text);padding:14px 18px;display:flex;align-items:center;gap:10px;flex-shrink:0}' +
      '.cb-hdr-av{width:36px;height:36px;border-radius:50%;object-fit:cover;border:2px solid rgba(255,255,255,.25);flex-shrink:0}' +
      '.cb-hdr-av-fb{width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,.2);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:var(--cb-header-text);flex-shrink:0}' +
      '.cb-hdr-info{flex:1;min-width:0}' +
      '.cb-hdr-name{font-size:15px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.cb-hdr-sub{font-size:11px;opacity:.7;margin-top:1px;display:flex;align-items:center;gap:4px}' +
      '.cb-hdr-dot{width:7px;height:7px;background:#22c55e;border-radius:50%;display:inline-block}' +
      '.cb-hdr-x{background:none;border:none;color:var(--cb-header-text);cursor:pointer;font-size:22px;padding:0 2px;opacity:.7;line-height:1;margin-left:auto;flex-shrink:0}' +
      '.cb-hdr-x:hover{opacity:1}' +
      // Messages
      '.cb-msgs{flex:1;overflow-y:auto;padding:16px 14px;display:flex;flex-direction:column;gap:10px;background:' + (isDark ? '#1e293b' : '#f8fafc') + ';scroll-behavior:smooth}' +
      '.cb-msgs::-webkit-scrollbar{width:4px}.cb-msgs::-webkit-scrollbar-thumb{background:#cbd5e1;border-radius:4px}' +
      '.cb-row{display:flex;align-items:flex-start !important;gap:8px;width:100%;animation:cb-up .2s ease}' +
      '.cb-row.user{justify-content:flex-end;align-items:flex-start !important}' +
      '.cb-row.bot{justify-content:flex-start;align-items:flex-start !important}' +
      '.cb-av{width:28px;height:28px;border-radius:50%;object-fit:cover;flex-shrink:0;border:1px solid rgba(0,0,0,.06);align-self:flex-start !important;margin-top:2px}' +
      '.cb-av-fb{width:28px;height:28px;border-radius:50%;background:var(--cb-primary);display:flex;align-items:center;justify-content:center;color:#fff;font-size:9px;font-weight:700;flex-shrink:0;align-self:flex-start !important;margin-top:2px}' +
      '.cb-bubble-wrap{display:flex;flex-direction:column;max-width:75%;gap:3px;min-width:0}' +
      '.cb-row.user .cb-bubble-wrap{align-items:flex-end}' +
      '.cb-row.bot .cb-bubble-wrap{align-items:flex-start}' +
      '.cb-m{padding:10px 14px;border-radius:var(--cb-radius);font-size:14px;line-height:1.55;word-wrap:break-word;white-space:pre-wrap;border-bottom-left-radius:4px}' +
      '.cb-m.user{background:var(--cb-user-bg);color:var(--cb-user-text);border-bottom-left-radius:var(--cb-radius);border-bottom-right-radius:4px}' +
      '.cb-m.bot{background:var(--cb-bot-bg);color:var(--cb-bot-text);box-shadow:0 1px 3px rgba(0,0,0,.07);border:1px solid ' + (isDark ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.04)') + '}' +
      // Timestamp
      '.cb-ts{font-size:10px;color:' + (isDark ? '#64748b' : '#94a3b8') + ';padding:0 2px;letter-spacing:.2px}' +
      // Typing dots
      '.cb-typing{display:flex;align-items:center;gap:4px;padding:8px 12px}' +
      '.cb-dot{width:7px;height:7px;background:' + (isDark ? '#64748b' : '#cbd5e1') + ';border-radius:50%;animation:cb-bounce 1.4s infinite both}' +
      '.cb-dot:nth-child(2){animation-delay:.2s}' +
      '.cb-dot:nth-child(3){animation-delay:.4s}' +
      '@keyframes cb-bounce{0%,80%,100%{transform:scale(.6);opacity:.5}40%{transform:scale(1.1);opacity:1}}' +
      // Chips
      '.cb-chips{display:flex;flex-wrap:wrap;gap:6px;padding:2px 0 2px 36px}' +
      '.cb-chip{background:' + (isDark ? '#334155' : '#fff') + ';color:var(--cb-primary);border:1.5px solid var(--cb-primary);padding:6px 13px;border-radius:20px;font-size:12.5px;cursor:pointer;transition:all .18s;font-family:inherit;font-weight:500}' +
      '.cb-chip:hover{background:var(--cb-primary);color:#fff;transform:translateY(-1px)}' +
      // Voice input & Waveform pulse styles
      '.cb-mic{background:none;border:none;cursor:pointer;padding:6px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:' + (isDark ? '#94a3b8' : '#64748b') + ';transition:all .2s;flex-shrink:0;margin-right:2px}' +
      '.cb-mic:hover{color:var(--cb-primary);background:' + activePrimaryColor + '18}' +
      '.cb-mic.recording{color:#ef4444;background:#fee2e2;animation:cb-mic-pulse 1.2s infinite}' +
      '@keyframes cb-mic-pulse{0%{transform:scale(1)}50%{transform:scale(1.15)}100%{transform:scale(1)}}' +
      '.cb-mic svg{width:18px;height:18px;fill:currentColor}' +
      '.cb-voice-wave{position:absolute;inset:0;background:' + (isDark ? 'rgba(15,23,42,0.95)' : 'rgba(255,255,255,0.96)') + ';border-radius:inherit;display:none;align-items:center;justify-content:center;gap:4px;z-index:10;padding:0 14px}' +
      '.cb-wave-bar{width:4px;height:16px;background:var(--cb-primary);border-radius:4px;animation:cb-wave-anim 0.75s ease-in-out infinite alternate}' +
      '.cb-wave-bar:nth-child(1){animation-delay:0s}' +
      '.cb-wave-bar:nth-child(2){animation-delay:0.18s}' +
      '.cb-wave-bar:nth-child(3){animation-delay:0.36s}' +
      '.cb-wave-bar:nth-child(4){animation-delay:0.54s}' +
      '@keyframes cb-wave-anim{0%{height:6px;opacity:0.4}100%{height:22px;opacity:1}}' +
      '.cb-voice-text{font-size:12px;color:' + (isDark ? '#f1f5f9' : '#1e293b') + ';margin-left:8px;font-weight:600;flex:1}' +
      // Option pills for lead questions
      '.cb-lead-opts{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}' +
      '.cb-opt-pill{background:' + (isDark ? '#1e293b' : '#fff') + ';color:var(--cb-primary);border:1.5px solid var(--cb-primary);padding:5px 12px;border-radius:16px;font-size:12px;font-weight:600;cursor:pointer;transition:all .18s;font-family:inherit}' +
      '.cb-opt-pill:hover{background:var(--cb-primary);color:#fff;transform:translateY(-1px)}' +
      // Privacy banner
      '.cb-privacy{background:' + (isDark ? '#1e3a5f' : '#fff9e6') + ';border-top:1px solid ' + (isDark ? '#2d4a6e' : '#fde68a') + ';padding:10px 14px;font-size:11.5px;color:' + (isDark ? '#93c5fd' : '#78350f') + ';display:flex;align-items:flex-start;gap:8px;flex-shrink:0;line-height:1.5}' +
      '.cb-privacy a{color:var(--cb-primary);font-weight:600;text-decoration:underline}' +
      '.cb-privacy-x{background:none;border:none;color:inherit;cursor:pointer;font-size:15px;padding:0;margin-left:auto;opacity:.6;flex-shrink:0;line-height:1}' +
      '.cb-privacy-x:hover{opacity:1}' +
      // General Input Wrap structure
      '.cb-in-wrap{background:' + (isDark ? '#0f172a' : '#fff') + ';flex-shrink:0}' +
      // 1. Floating Pill Style (HubSpot / Intercom-inspired)
      '.cb-in-wrap.style-floating_pill{padding:10px 14px;background:transparent;border-top:none}' +
      '.cb-in-wrap.style-floating_pill .cb-in{background:' + (isDark ? '#1e293b' : '#f3f4f8') + ';border-radius:24px;border:1.5px solid ' + (isDark ? '#334155' : '#e5e7eb') + ';padding:6px 6px 6px 14px;box-shadow:0 3px 12px rgba(0,0,0,0.04);display:flex;gap:8px;align-items:center}' +
      '.cb-in-wrap.style-floating_pill .cb-inp-wrap{flex:1;display:flex;align-items:center;background:transparent;border:none;overflow:hidden}' +
      '.cb-in-wrap.style-floating_pill .cb-inp{padding:6px 0;border:none;background:transparent;color:' + (isDark ? '#f1f5f9' : '#1e293b') + ';outline:none;font-family:inherit}' +
      '.cb-in-wrap.style-floating_pill .cb-snd{background:var(--cb-primary);border:none;border-radius:50%;width:34px;height:34px;min-width:34px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:transform .18s;box-shadow:0 2px 10px ' + activePrimaryColor + '40}' +
      // 2. Minimalist Borderless Style
      '.cb-in-wrap.style-minimal_borderless{padding:14px 18px;background:' + (isDark ? '#0f172a' : '#fff') + ';border-top:1px solid ' + (isDark ? '#334155' : '#f0f0f5') + '}' +
      '.cb-in-wrap.style-minimal_borderless .cb-in{display:flex;gap:10px;padding:0;align-items:center;background:transparent;border:none}' +
      '.cb-in-wrap.style-minimal_borderless .cb-inp-wrap{flex:1;display:flex;align-items:center;background:transparent;border:none}' +
      '.cb-in-wrap.style-minimal_borderless .cb-inp{padding:6px 0;border:none;background:transparent;color:' + (isDark ? '#f1f5f9' : '#1e293b') + ';outline:none;font-family:inherit}' +
      '.cb-in-wrap.style-minimal_borderless .cb-snd{background:transparent;border:none;width:34px;height:34px;min-width:34px;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:none;transition:transform .18s}' +
      '.cb-in-wrap.style-minimal_borderless .cb-snd svg{fill:var(--cb-primary)}' +
      // 3. Classic Card Box Style
      '.cb-in-wrap.style-classic_card{padding:12px 14px;background:' + (isDark ? '#0f172a' : '#fff') + ';border-top:1px solid ' + (isDark ? '#334155' : '#f0f0f5') + '}' +
      '.cb-in-wrap.style-classic_card .cb-in{background:' + (isDark ? '#1e293b' : '#fff') + ';border:1.5px solid ' + (isDark ? '#334155' : '#e5e7eb') + ';border-radius:10px;padding:8px 12px;display:flex;gap:10px;align-items:center}' +
      '.cb-in-wrap.style-classic_card .cb-inp-wrap{flex:1;display:flex;align-items:center;background:transparent;border:none}' +
      '.cb-in-wrap.style-classic_card .cb-inp{padding:2px 0;border:none;background:transparent;color:' + (isDark ? '#f1f5f9' : '#1e293b') + ';outline:none;font-family:inherit}' +
      '.cb-in-wrap.style-classic_card .cb-snd{background:var(--cb-primary);border:none;border-radius:8px;width:34px;height:34px;min-width:34px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:transform .18s}' +
      // General focus transitions
      '.cb-in-wrap:focus-within .cb-in{border-color:var(--cb-primary)}' +
      '.cb-in-wrap.style-floating_pill:focus-within .cb-in{box-shadow:0 0 0 4px ' + activePrimaryColor + '18;background:' + (isDark ? '#1e293b' : '#fff') + ';border-color:var(--cb-primary)}' +
      '.cb-in-wrap.style-classic_card:focus-within .cb-in{box-shadow:0 0 0 4px ' + activePrimaryColor + '18}' +
      '.cb-snd:hover{transform:scale(1.08)}' +
      '.cb-snd:disabled{opacity:.4;cursor:not-allowed;transform:none;box-shadow:none}' +
      '.cb-snd svg{width:16px;height:16px;fill:#fff}' +
      '.cb-disclaimer{font-size:10px;color:' + (isDark ? '#64748b' : '#94a3b8') + ';text-align:center;padding:0 14px 9px}' +
      // Callout bubble
      '.cb-callout{position:fixed;bottom:92px;right:' + posRight + ';left:' + posLeft + ';background:#fff;color:#0f172a;padding:11px 15px;border-radius:14px;box-shadow:0 6px 24px rgba(0,0,0,.14);z-index:99997;font-size:13px;font-family:var(--cb-font);max-width:260px;display:flex;align-items:center;gap:8px;border:1px solid #e2e8f0;cursor:pointer;animation:cb-up .3s ease;line-height:1.4}' +
      '.cb-callout-x{background:none;border:none;color:#94a3b8;cursor:pointer;font-size:15px;padding:0;margin-left:auto;line-height:1}' +
      '.cb-callout-x:hover{color:#64748b}' +
      // Upgraded Feedback Card
      '.cb-feedback{background:' + (isDark ? '#1e293b' : '#fff') + ';border:1px solid ' + (isDark ? '#334155' : '#e2e8f0') + ';border-radius:14px;padding:18px 16px;margin:4px 0;box-shadow:0 2px 12px rgba(0,0,0,.08);animation:cb-up .25s ease;position:relative}' +
      '.cb-feedback-title{font-size:14px;font-weight:700;color:' + (isDark ? '#f1f5f9' : '#1e293b') + ';margin-bottom:4px}' +
      '.cb-feedback-sub{font-size:12px;color:' + (isDark ? '#94a3b8' : '#64748b') + ';margin-bottom:14px}' +
      '.cb-fb-opts{display:flex;gap:10px;justify-content:center}' +
      '.cb-fb-btn{display:flex;flex-direction:column;align-items:center;gap:6px;background:none;border:1.5px solid ' + (isDark ? '#334155' : '#e2e8f0') + ';border-radius:12px;padding:12px 16px;cursor:pointer;transition:all .2s;min-width:72px;font-family:inherit}' +
      '.cb-fb-btn:hover{border-color:var(--cb-primary);background:' + activePrimaryColor + '10;transform:translateY(-2px);box-shadow:0 4px 12px rgba(0,0,0,.1)}' +
      '.cb-fb-btn.selected{border-color:var(--cb-primary);background:var(--cb-primary);color:#fff}' +
      '.cb-fb-btn.selected .cb-fb-label{color:#fff}' +
      '.cb-fb-icon{width:32px;height:32px;object-fit:contain}' +
      '.cb-fb-icon-svg{width:32px;height:32px}' +
      '.cb-fb-label{font-size:11px;font-weight:600;color:' + (isDark ? '#94a3b8' : '#64748b') + ';text-align:center;line-height:1.3}' +
      '.cb-fb-thanks{text-align:center;padding:8px 0;font-size:13px;color:' + (isDark ? '#86efac' : '#16a34a') + ';font-weight:600;display:flex;align-items:center;justify-content:center;gap:6px}' +
      '.cb-fb-comment{width:100%;border:1.5px solid ' + (isDark ? '#475569' : '#e2e8f0') + ';border-radius:8px;padding:8px 12px;font-size:13px;outline:none;resize:none;font-family:inherit;background:' + (isDark ? '#1e293b' : '#f8fafc') + ';color:inherit;margin-top:10px;height:60px}' +
      '.cb-fb-comment:focus{border-color:var(--cb-primary);box-shadow:0 0 0 3px ' + activePrimaryColor + '18}' +
      '.cb-fb-submit{background:var(--cb-primary);color:#fff;border:none;border-radius:8px;padding:8px 14px;font-size:12.5px;font-weight:600;cursor:pointer;transition:transform .15s}' +
      '.cb-fb-submit:hover{transform:scale(1.05)}' +
      '.cb-fb-skip-link{background:none;border:none;color:' + (isDark ? '#94a3b8' : '#64748b') + ';cursor:pointer;font-size:12.5px;font-weight:500;text-decoration:underline}' +
      '.cb-fb-skip-link:hover{color:var(--cb-primary)}' +
      '.cb-fb-top-skip{background:none;border:none;color:' + (isDark ? '#64748b' : '#94a3b8') + ';cursor:pointer;font-size:11px;font-weight:600;position:absolute;top:12px;right:14px;text-transform:uppercase;letter-spacing:.5px}' +
      '.cb-fb-top-skip:hover{color:#ef4444}' +
      // Lead Collection Card (Interactive Form Card Inline)
      '.cb-lead-card{background:' + (isDark ? '#27354a' : '#ffffff') + ';border:1.5px dashed ' + (isDark ? '#3b4f6a' : '#cbd5e1') + ';border-radius:12px;padding:14px;margin:6px 0 6px 36px;animation:cb-up .25s ease;display:flex;flex-direction:column;gap:8px;max-width:80%;box-shadow:0 3px 10px rgba(0,0,0,0.03)}' +
      '.cb-lead-title{font-size:12px;font-weight:700;color:' + (isDark ? '#93c5fd' : '#1e3a8a') + ';text-transform:uppercase;letter-spacing:.5px}' +
      '.cb-lead-input-row{display:flex;gap:6px;width:100%}' +
      '.cb-lead-input-field{flex:1;border:1.5px solid ' + (isDark ? '#475569' : '#cbd5e1') + ';border-radius:8px;padding:8px 12px;font-size:13.5px;outline:none;background:' + (isDark ? '#1e293b' : '#f8fafc') + ';color:' + (isDark ? '#f1f5f9' : '#1e293b') + ';font-family:inherit}' +
      '.cb-lead-input-field:focus{border-color:var(--cb-primary);box-shadow:0 0 0 3px ' + activePrimaryColor + '18}' +
      '.cb-lead-input-submit{background:var(--cb-primary);border:none;border-radius:8px;width:36px;height:36px;min-width:36px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:transform .15s}' +
      '.cb-lead-input-submit:hover{transform:scale(1.06)}' +
      '.cb-lead-input-submit svg{width:16px;height:16px;fill:#fff}' +
      '.cb-lead-error{font-size:11px;color:#ef4444;font-weight:500;display:none}' +
      '.cb-fb-opts{display:flex;gap:10px;justify-content:center}' +
      '.cb-fb-btn{display:flex;flex-direction:column;align-items:center;gap:6px;background:none;border:1.5px solid ' + (isDark ? '#334155' : '#e2e8f0') + ';border-radius:12px;padding:12px 16px;cursor:pointer;transition:all .2s;min-width:72px;font-family:inherit}' +
      '.cb-fb-btn:hover{border-color:var(--cb-primary);background:' + activePrimaryColor + '10;transform:translateY(-2px);box-shadow:0 4px 12px rgba(0,0,0,.1)}' +
      '.cb-fb-btn.selected{border-color:var(--cb-primary);background:var(--cb-primary);color:#fff}' +
      '.cb-fb-btn.selected .cb-fb-label{color:#fff}' +
      '.cb-fb-icon{width:32px;height:32px;object-fit:contain}' +
      '.cb-fb-icon-svg{width:32px;height:32px}' +
      '.cb-fb-label{font-size:11px;font-weight:600;color:' + (isDark ? '#94a3b8' : '#64748b') + ';text-align:center;line-height:1.3}' +
      '.cb-fb-thanks{text-align:center;padding:8px 0;font-size:13px;color:' + (isDark ? '#86efac' : '#16a34a') + ';font-weight:600;display:flex;align-items:center;justify-content:center;gap:6px}' +
      // Stars (5-star rating fallback)
      '.cb-stars{display:flex;gap:4px;justify-content:center}' +
      '.cb-star{width:28px;height:28px;cursor:pointer;transition:transform .15s}' +
      '.cb-star:hover{transform:scale(1.2)}' +
      '.cb-star path{fill:#e2e8f0;transition:fill .15s}' +
      '.cb-star.lit path{fill:#fbbf24}' +
      '@media(max-width:480px){.cb-box{width:calc(100vw - 16px);height:calc(100vh - 90px);right:8px;left:8px;bottom:78px}.cb-btn{bottom:16px}}';
    document.head.appendChild(style);

    // ── Launcher button ──────────────────────────────────────────────────────────
    var btn = document.createElement('button');
    btn.id = 'cb-launcher-btn';
    btn.type = 'button';
    btn.className = 'cb-btn style-' + launcherStyle;
    btn.setAttribute('aria-label', 'Open chat');
    btn.style.cssText = 'position:fixed!important;bottom:20px!important;right:' + posRight + '!important;left:' + posLeft + '!important;z-index:2147483647!important;display:flex!important;align-items:center!important;justify-content:center!important;cursor:pointer!important;transition:transform .3s,box-shadow .3s!important;padding:0!important;overflow:hidden!important;background:var(--cb-primary)!important;color:#fff!important;border:none!important;pointer-events:auto!important;';

    var iconHtml = activeLauncherIcon
      ? '<img src="' + activeLauncherIcon + '" style="width:28px;height:28px;border-radius:50%;object-fit:cover;" />'
      : '<svg viewBox="0 0 24 24" style="width:24px;height:24px;fill:#fff;"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/></svg>';

    if (launcherStyle === 'modern_pill') {
      btn.innerHTML = iconHtml + '<span style="font-size:13.5px;font-weight:600;color:#fff;white-space:nowrap;margin-left:4px;">' + launcherPillText + '</span>';
    } else {
      if (activeLauncherIcon) {
        btn.innerHTML = '<img src="' + activeLauncherIcon + '" style="width:100%;height:100%;border-radius:inherit;object-fit:cover;" />';
      } else {
        btn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/></svg>';
      }
    }
    btn.style.position = 'fixed';
    btn.style.zIndex = '2147483647';
    if (!appendToRoot(btn)) {
      addToRoot(btn);
    }

    // ── Widget box ───────────────────────────────────────────────────────────────
    var box = document.createElement('div');
    box.className = 'cb-box';

    // Header avatar HTML
    var hdrAvHtml = '';
    if (activeLogo) {
      hdrAvHtml = '<img class="cb-hdr-av" src="' + activeLogo + '" alt="logo"/>';
    } else {
      hdrAvHtml = '<div class="cb-hdr-av-fb">' + (config.name || 'AI').substring(0, 2).toUpperCase() + '</div>';
    }

    var disclaimerHtml = disclaimerText ? '<div class="cb-disclaimer">' + disclaimerText + '</div>' : '';

    box.innerHTML =
      '<div class="cb-hdr">' +
        hdrAvHtml +
        '<div class="cb-hdr-info">' +
          '<div class="cb-hdr-name">' + (config.name || 'Chat') + '</div>' +
          '<div class="cb-hdr-sub"><span class="cb-hdr-dot"></span>Powered by AI</div>' +
        '</div>' +
        '<button class="cb-hdr-x" aria-label="Close">&times;</button>' +
      '</div>' +
      '<div class="cb-msgs"></div>' +
      '<div class="cb-in-wrap style-' + inputStyle + '" style="position:relative;">' +
        (privacyText ? '<div class="cb-privacy" id="cb-privacy-banner"><span>' + privacyText + (privacyUrl ? ' <a href="' + privacyUrl + '" target="_blank" rel="noopener">privacy policy</a>.' : '') + '</span><button class="cb-privacy-x" title="Dismiss">&times;</button></div>' : '') +
        '<div class="cb-in"><div class="cb-inp-wrap"><textarea class="cb-inp" rows="1" placeholder="Type a message\u2026"></textarea></div>' +
        (voiceEnabled ? '<button class="cb-mic" title="Voice Input"><svg viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z"/></svg></button>' : '') +
        '<button class="cb-snd"><svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg></button>' +
        '<div class="cb-voice-wave"><div class="cb-wave-bar"></div><div class="cb-wave-bar"></div><div class="cb-wave-bar"></div><div class="cb-wave-bar"></div><span class="cb-voice-text">Listening...</span><button class="cb-voice-close" style="background:none;border:none;color:inherit;cursor:pointer;font-size:16px;line-height:1;">&times;</button></div>' +
        '</div>' +
        disclaimerHtml +
      '</div>';

    appendToRoot(box);

    var msgs  = box.querySelector('.cb-msgs');
    var inp   = box.querySelector('.cb-inp');
    var snd   = box.querySelector('.cb-snd');
    var cls   = box.querySelector('.cb-hdr-x');
    var isOpen = false, isSending = false;

    // Auto-resize textarea
    inp.addEventListener('input', function() {
      inp.style.height = 'auto';
      inp.style.height = Math.min(inp.scrollHeight, 90) + 'px';
    });

    // Privacy banner dismiss
    var privacyBanner = box.querySelector('#cb-privacy-banner');
    if (privacyBanner) {
      if (localStorage.getItem(privacyBannerKey)) {
        privacyBanner.style.display = 'none';
      } else {
        privacyBanner.querySelector('.cb-privacy-x').onclick = function() {
          privacyBanner.style.display = 'none';
          localStorage.setItem(privacyBannerKey, '1');
        };
      }
    }

    // Voice Input Recognition Handler
    var micBtn = box.querySelector('.cb-mic');
    var voiceWave = box.querySelector('.cb-voice-wave');
    var voiceClose = box.querySelector('.cb-voice-close');
    var isRecording = false, manualStop = false;

    if (micBtn && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)) {
      var SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;

      function buildRec() {
        var r = new SpeechRecognitionAPI();
        r.continuous = true;
        r.interimResults = true;
        r.lang = (voiceObj && voiceObj.language) ? voiceObj.language : 'en-US';

        r.onresult = function(event) {
          var t = '';
          for (var i = 0; i < event.results.length; i++) {
            t += event.results[i][0].transcript;
          }
          if (t.trim()) {
            inp.value = t;
            inp.style.height = 'auto';
            inp.style.height = Math.min(inp.scrollHeight, 90) + 'px';
          }
        };

        r.onerror = function(ev) {
          // ignore benign errors — the onend below will handle restart
          if (ev.error === 'aborted') return;
          if (ev.error === 'no-speech') return;
        };

        r.onend = function() {
          // If user didn't manually stop, restart with a BRAND NEW instance
          // (Chrome invalidates the instance after onend fires)
          if (isRecording && !manualStop) {
            try {
              var next = buildRec();
              next.start();
            } catch (e) {
              // couldn't restart — just stop cleanly
              finishStop();
            }
          } else {
            finishStop();
          }
        };

        return r;
      }

      function finishStop() {
        isRecording = false;
        try { micBtn.classList.remove('recording'); } catch(e) {}
        if (voiceWave) voiceWave.style.display = 'none';
        if (voiceAutoSend && manualStop && inp.value.trim()) {
          sendMsg();
        }
      }

      function startVoice() {
        manualStop = false;
        isRecording = true;
        micBtn.classList.add('recording');
        if (voiceWave) voiceWave.style.display = 'flex';
        try {
          buildRec().start();
        } catch(e) {
          isRecording = false;
          micBtn.classList.remove('recording');
          if (voiceWave) voiceWave.style.display = 'none';
          console.warn('Voice start error:', e);
        }
      }

      function stopVoice() {
        manualStop = true;
        // Let onend fire and call finishStop — just mark flag
        // We don't have a reference to the active rec, so we use a passive stop
        // by setting isRecording = false so onend sees it and calls finishStop
        isRecording = false;
        // Visually reset immediately
        try { micBtn.classList.remove('recording'); } catch(e) {}
        if (voiceWave) voiceWave.style.display = 'none';
      }

      micBtn.onclick = function() {
        if (isRecording) {
          stopVoice();
        } else {
          startVoice();
        }
      };

      if (voiceClose) {
        voiceClose.onclick = stopVoice;
      }
    }

    // ── Helpers ──────────────────────────────────────────────────────────────────
    function nowTime() {
      var d = new Date();
      var h = d.getHours(), m = d.getMinutes();
      var ampm = h >= 12 ? 'PM' : 'AM';
      h = h % 12 || 12;
      return h + ':' + (m < 10 ? '0' + m : m) + ' ' + ampm;
    }

    function makeBotAvatar() {
      if (activeBotAvatar) {
        var img = document.createElement('img');
        img.className = 'cb-av';
        img.src = activeBotAvatar;
        img.alt = 'bot';
        return img;
      }
      var fb = document.createElement('div');
      fb.className = 'cb-av-fb';
      fb.textContent = (config.name || 'AI').substring(0, 2).toUpperCase();
      return fb;
    }

    function addMsg(text, role) {
      var row = document.createElement('div');
      row.className = 'cb-row ' + role;

      var wrap = document.createElement('div');
      wrap.className = 'cb-bubble-wrap';

      var bubble = document.createElement('div');
      bubble.className = 'cb-m ' + role;
      bubble.textContent = text;

      var ts = document.createElement('span');
      ts.className = 'cb-ts';
      ts.textContent = nowTime();

      wrap.appendChild(bubble);
      wrap.appendChild(ts);

      if (role === 'bot') {
        row.appendChild(makeBotAvatar());
        row.appendChild(wrap);
      } else {
        row.appendChild(wrap);
      }

      msgs.appendChild(row);
      msgs.scrollTop = msgs.scrollHeight;
      return bubble;
    }

    // ── Welcome message ───────────────────────────────────────────────────────────
    addMsg(config.welcomeMessage || 'Hello! How can I help you?', 'bot');

    // Starter chips
    if (activeStarterQuestions && activeStarterQuestions.length > 0) {
      var chipsEl = document.createElement('div');
      chipsEl.className = 'cb-chips';
      activeStarterQuestions.forEach(function(q) {
        var c = document.createElement('button');
        c.className = 'cb-chip';
        c.textContent = q;
        c.onclick = function() { inp.value = q; sendMsg(); chipsEl.remove(); };
        chipsEl.appendChild(c);
      });
      msgs.appendChild(chipsEl);
    }

    // ── Callout notification ───────────────────────────────────────────────────────
    if (calloutMsg && !localStorage.getItem('cb_callout_dismissed')) {
      setTimeout(function() {
        if (!isOpen) {
          var callout = document.createElement('div');
          callout.className = 'cb-callout';
          callout.innerHTML = '<span>' + calloutMsg + '</span><button class="cb-callout-x">&times;</button>';
          document.body.appendChild(callout);
          callout.querySelector('.cb-callout-x').onclick = function(e) {
            e.stopPropagation();
            callout.remove();
            localStorage.setItem('cb_callout_dismissed', 'true');
          };
          callout.onclick = function() { callout.remove(); btn.click(); };
        }
      }, calloutDelay * 1000);
    }

    // ── Feedback card ─────────────────────────────────────────────────────────────
    var GOODBYE_PATTERNS = /\\b(thank you|thanks|bye|goodbye|good bye|that.?s all|see you|all good|done|ok thanks|okay thanks|no more|i.?m good|i.?m done|cheers|great thanks|perfect thanks|that.?s it|that.?s enough|noted|got it thanks)\\b/i;

    function showFeedbackCard() {
      if (feedbackShown || !feedbackEnabled) return;
      feedbackShown = true;

      var card = document.createElement('div');
      card.className = 'cb-feedback';

      var botName = config.name || 'us';

      // Professional SVG icons (used if no custom URLs provided)
      var svgBad = '<svg class="cb-fb-icon-svg" viewBox="0 0 40 40" fill="none"><circle cx="20" cy="20" r="18" fill="#fee2e2" stroke="#fca5a5" stroke-width="1.5"/><circle cx="14" cy="16" r="2" fill="#ef4444"/><circle cx="26" cy="16" r="2" fill="#ef4444"/><path d="M13 28c0-3.866 3.134-7 7-7s7 3.134 7 7" stroke="#ef4444" stroke-width="2" stroke-linecap="round"/></svg>';
      var svgNeutral = '<svg class="cb-fb-icon-svg" viewBox="0 0 40 40" fill="none"><circle cx="20" cy="20" r="18" fill="#fef9c3" stroke="#fde047" stroke-width="1.5"/><circle cx="14" cy="16" r="2" fill="#ca8a04"/><circle cx="26" cy="16" r="2" fill="#ca8a04"/><line x1="13" y1="27" x2="27" y2="27" stroke="#ca8a04" stroke-width="2" stroke-linecap="round"/></svg>';
      var svgGood = '<svg class="cb-fb-icon-svg" viewBox="0 0 40 40" fill="none"><circle cx="20" cy="20" r="18" fill="#dcfce7" stroke="#86efac" stroke-width="1.5"/><circle cx="14" cy="16" r="2" fill="#16a34a"/><circle cx="26" cy="16" r="2" fill="#16a34a"/><path d="M13 23c1.5 3 10.5 3 14 0" stroke="#16a34a" stroke-width="2" stroke-linecap="round"/></svg>';

      function makeIconHtml(url, fallbackSvg) {
        if (url) return '<img class="cb-fb-icon" src="' + url + '" alt="rating icon"/>';
        return fallbackSvg;
      }

      card.innerHTML =
        '<button class="cb-fb-top-skip" title="Skip Feedback">Skip</button>' +
        '<div class="cb-feedback-title">How was your experience?</div>' +
        '<div class="cb-feedback-sub">Rate your chat with ' + botName + ' today</div>' +
        '<div class="cb-fb-opts">' +
          '<button class="cb-fb-btn" data-rating="1" data-label="Not Satisfied">' +
            makeIconHtml(feedbackBadUrl, svgBad) +
            '<span class="cb-fb-label">Not<br>Satisfied</span>' +
          '</button>' +
          '<button class="cb-fb-btn" data-rating="3" data-label="Neutral">' +
            makeIconHtml(feedbackNeutralUrl, svgNeutral) +
            '<span class="cb-fb-label">Neutral</span>' +
          '</button>' +
          '<button class="cb-fb-btn" data-rating="5" data-label="Satisfied">' +
            makeIconHtml(feedbackGoodUrl, svgGood) +
            '<span class="cb-fb-label">Satisfied</span>' +
          '</button>' +
        '</div>' +
        '<div class="cb-fb-comment-wrap" style="display:none;margin-top:12px;">' +
          '<textarea class="cb-fb-comment" placeholder="What can we improve? (Optional)"></textarea>' +
          '<div style="display:flex;align-items:center;gap:12px;margin-top:8px;">' +
            '<button class="cb-fb-submit">Submit</button>' +
            '<button class="cb-fb-skip-link">Skip</button>' +
          '</div>' +
        '</div>';

      msgs.appendChild(card);
      msgs.scrollTop = msgs.scrollHeight;

      var selectedRating = null;
      var selectedLabel = '';

      function dismissFeedback(withThanks) {
        if (withThanks) {
          card.innerHTML = '<div class="cb-fb-thanks"><svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="#dcfce7" stroke="#86efac" stroke-width="1.5"/><path d="M7 12l3 3 6-6" stroke="#16a34a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg> Thanks for your feedback!</div>';
        } else {
          card.remove();
        }
        msgs.scrollTop = msgs.scrollHeight;
      }

      card.querySelector('.cb-fb-top-skip').onclick = function() {
        fetch(SERVER_URL + '/widget/feedback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: sessionId, botId: config.id, rating: null, label: 'Skipped' })
        }).catch(function() {});
        dismissFeedback(false);
      };

      card.querySelector('.cb-fb-skip-link').onclick = function() {
        fetch(SERVER_URL + '/widget/feedback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: sessionId, botId: config.id, rating: selectedRating, label: selectedLabel, comment: '' })
        }).catch(function() {});
        dismissFeedback(true);
      };

      card.querySelectorAll('.cb-fb-btn').forEach(function(b) {
        b.onclick = function() {
          selectedRating = b.getAttribute('data-rating');
          selectedLabel  = b.getAttribute('data-label');
          card.querySelectorAll('.cb-fb-btn').forEach(function(x) { x.classList.remove('selected'); });
          b.classList.add('selected');
          
          // Reveal comments area
          var commentWrap = card.querySelector('.cb-fb-comment-wrap');
          commentWrap.style.display = 'block';
          msgs.scrollTop = msgs.scrollHeight;
        };
      });

      card.querySelector('.cb-fb-submit').onclick = function() {
        var comment = card.querySelector('.cb-fb-comment').value.trim();
        fetch(SERVER_URL + '/widget/feedback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: sessionId,
            botId: config.id,
            rating: selectedRating,
            label: selectedLabel,
            comment: comment
          })
        }).catch(function() {});
        dismissFeedback(true);
      };
    }

    // ── Inline Contact/Lead input box ─────────────────────────────────────────────
    function renderLeadCard(fieldId, label, options) {
      var existingCard = msgs.querySelector('.cb-lead-card[data-field="' + fieldId + '"]');
      if (existingCard) return;

      var card = document.createElement('div');
      card.className = 'cb-lead-card';
      card.setAttribute('data-field', fieldId);

      var placeholder = 'Enter your ' + label.toLowerCase() + '...';
      var inputType = 'text';
      if (fieldId === 'email') inputType = 'email';
      if (fieldId === 'phone') inputType = 'tel';

      var optionsHtml = '';
      if (options && options.length > 0) {
        optionsHtml = '<div class="cb-lead-opts">' +
          options.map(function(opt) {
            return '<button type="button" class="cb-opt-pill" data-val="' + String(opt).replace(/"/g, '&quot;') + '">' + opt + '</button>';
          }).join('') +
        '</div>';
      }

      card.innerHTML =
        '<div class="cb-lead-title">Provide ' + label + '</div>' +
        '<div class="cb-lead-input-row">' +
          '<input type="' + inputType + '" class="cb-lead-input-field" placeholder="' + placeholder + '" />' +
          '<button class="cb-lead-input-submit">' +
            '<svg viewBox="0 0 24 24"><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/></svg>' +
          '</button>' +
        '</div>' +
        optionsHtml;

      msgs.appendChild(card);
      msgs.scrollTop = msgs.scrollHeight;

      var input = card.querySelector('.cb-lead-input-field');
      var submitBtn = card.querySelector('.cb-lead-input-submit');

      input.focus();

      card.querySelectorAll('.cb-opt-pill').forEach(function(pill) {
        pill.onclick = function() {
          input.value = pill.getAttribute('data-val');
          submitVal();
        };
      });

      function submitVal() {
        var val = input.value.trim();
        if (!val) return;

        submitBtn.disabled = true;
        input.disabled = true;

        inp.value = val;
        sendMsg();

        setTimeout(function() {
          card.remove();
        }, 1000);
      }

      submitBtn.onclick = submitVal;
      input.onkeypress = function(e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          submitVal();
        }
      };
    }

    // ── Send message ──────────────────────────────────────────────────────────────
    function sendMsg() {
      var text = inp.value.trim();
      if (!text || isSending) return;

      var chips = msgs.querySelector('.cb-chips');
      if (chips) chips.remove();

      // User bubble with timestamp
      var userRow = document.createElement('div');
      userRow.className = 'cb-row user';
      var userWrap = document.createElement('div');
      userWrap.className = 'cb-bubble-wrap';
      var userBubble = document.createElement('div');
      userBubble.className = 'cb-m user';
      userBubble.textContent = text;
      var userTs = document.createElement('span');
      userTs.className = 'cb-ts';
      userTs.textContent = nowTime();
      userWrap.appendChild(userBubble);
      userWrap.appendChild(userTs);
      userRow.appendChild(userWrap);
      msgs.appendChild(userRow);
      msgs.scrollTop = msgs.scrollHeight;

      inp.value = '';
      inp.style.height = 'auto';
      isSending = true;
      snd.disabled = true;

      // Check goodbye BEFORE sending (to show feedback after AI responds)
      var isGoodbye = GOODBYE_PATTERNS.test(text);

      // Bot thinking row
      var botRow = document.createElement('div');
      botRow.className = 'cb-row bot';
      botRow.appendChild(makeBotAvatar());
      var botWrap = document.createElement('div');
      botWrap.className = 'cb-bubble-wrap';
      var botBubble = document.createElement('div');
      botBubble.className = 'cb-m bot';
      if (enableThinking) {
        botBubble.innerHTML = '<div class="cb-typing"><div class="cb-dot"></div><div class="cb-dot"></div><div class="cb-dot"></div></div>';
      }
      var botTs = document.createElement('span');
      botTs.className = 'cb-ts';
      botWrap.appendChild(botBubble);
      botWrap.appendChild(botTs);
      botRow.appendChild(botWrap);
      msgs.appendChild(botRow);
      msgs.scrollTop = msgs.scrollHeight;

      var isFirstToken = true;

      fetch(SERVER_URL + '/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, sessionId: sessionId, botId: config.id, pageUrl: window.location.href })
      }).then(function(response) {
        var reader  = response.body.getReader();
        var decoder = new TextDecoder();
        var buffer  = '';

        function read() {
          reader.read().then(function(result) {
            if (result.done) {
              botTs.textContent = nowTime();
              isSending = false;
              snd.disabled = false;
              if (isGoodbye) setTimeout(showFeedbackCard, 900);
              return;
            }
            buffer += decoder.decode(result.value, { stream: true });
            var lines = buffer.split('\\n');
            buffer = lines.pop() || '';
            for (var i = 0; i < lines.length; i++) {
              var line = lines[i].trim();
              if (!line || line.indexOf('data: ') !== 0) continue;
              try {
                var data = JSON.parse(line.slice(6));
                if (data.type === 'chunk') {
                  if (isFirstToken) { botBubble.innerHTML = ''; isFirstToken = false; }
                  botBubble.textContent += data.content;
                  msgs.scrollTop = msgs.scrollHeight;
                } else if (data.type === 'start' && data.sessionId) {
                  sessionId = data.sessionId;
                  localStorage.setItem(sessionKey, sessionId);
                } else if (data.type === 'done') {
                  botTs.textContent = nowTime();
                  if (data.leadField) {
                    renderLeadCard(data.leadField, data.leadLabel, data.leadOptions);
                  }
                } else if (data.type === 'error') {
                  if (isFirstToken) botBubble.innerHTML = '';
                  botBubble.textContent = 'Sorry, something went wrong.';
                }
              } catch(e) {}
            }
            read();
          }).catch(function() {
            if (isFirstToken) botBubble.innerHTML = '';
            if (!botBubble.textContent) botBubble.textContent = 'Connection error. Please try again.';
            botTs.textContent = nowTime();
            isSending = false;
            snd.disabled = false;
          });
        }
        read();
      }).catch(function() {
        if (isFirstToken) botBubble.innerHTML = '';
        botBubble.textContent = 'Connection error. Please try again.';
        botTs.textContent = nowTime();
        isSending = false;
        snd.disabled = false;
      });
    }

    // ── Controls ─────────────────────────────────────────────────────────────────
    btn.onclick = function() {
      isOpen = !isOpen;
      box.classList.toggle('open', isOpen);
      if (isOpen) {
        inp.focus();
        var callout = document.querySelector('.cb-callout');
        if (callout) callout.remove();
      }
    };
    cls.onclick = function() { isOpen = false; box.classList.remove('open'); };

    snd.onclick = sendMsg;
    inp.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); }
    });
  }
})();
`;

  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.send(widgetScript);
});

module.exports = router;
