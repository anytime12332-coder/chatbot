const express = require('express');
const prisma = require('../lib/prisma');

const router = express.Router();

// GET /widget/config/:botId
router.get('/config/:botId', async (req, res) => {
  try {
    const chatbot = await prisma.chatbot.findUnique({
      where: { id: req.params.botId },
      select: { id: true, name: true, welcomeMessage: true, primaryColor: true, position: true, isActive: true, widgetTheme: true },
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
      select: { id: true, name: true, welcomeMessage: true, primaryColor: true, position: true, isActive: true, widgetTheme: true },
    });
    if (!chatbot) return res.status(404).json({ error: 'No active bot found' });
    res.json(chatbot);
  } catch (error) {
    console.error('Widget config error:', error);
    res.status(500).json({ error: 'Failed to get widget config' });
  }
});

// GET /widget/embed.js - Embeddable widget with STREAMING support
router.get('/embed.js', (req, res) => {
  const serverUrl = `${req.protocol}://${req.get('host')}`;

  const widgetScript = `
(function() {
  if (window.__chatbotWidgetLoaded) return;
  window.__chatbotWidgetLoaded = true;

  var SERVER_URL = '${serverUrl}';
  var scriptTag = document.currentScript || document.querySelector('script[data-chatbot-id]');
  var botId = scriptTag ? scriptTag.getAttribute('data-chatbot-id') : null;

  var sessionKey = 'chatbot_session_' + (botId || 'default');
  var sessionId = localStorage.getItem(sessionKey);
  if (!sessionId) {
    sessionId = 'sess_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
    localStorage.setItem(sessionKey, sessionId);
  }

  var configUrl = botId ? SERVER_URL + '/widget/config/' + botId : SERVER_URL + '/widget/config';
  fetch(configUrl)
    .then(function(r) { return r.json(); })
    .then(function(config) {
      if (!config.isActive) return;
      initWidget(config);
    })
    .catch(function(err) { console.error('Chatbot widget error:', err); });

  function initWidget(config) {
    var theme = {};
    try {
      theme = JSON.parse(config.widgetTheme || '{}');
    } catch(e) {}

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
      }
    };

    var templateId = theme.templateId || 'modern_gradient';
    var preset = templates[templateId] || templates.modern_gradient;

    var activePrimaryColor = theme.primaryColor || config.primaryColor || preset.primaryColor;
    var activeHeaderBg = theme.headerBg || activePrimaryColor;
    var activeUserBubbleBg = theme.userBubbleColor || activePrimaryColor;
    var activeBotBubbleBg = theme.botBubbleColor || preset.botBubbleBg;
    var activeBorderRadius = preset.borderRadius;
    var activeFont = preset.fontFamily;
    var activeLogo = theme.logoUrl || '';
    var activeLauncherIcon = theme.launcherIconUrl || '';
    var activeStarterQuestions = theme.starterQuestions || [];

    // Premium Widget Customizations
    var activeBotAvatar = theme.botAvatarUrl || '';
    var enableThinking = theme.enableThinkingAnimation !== false;
    var calloutMsg = theme.calloutMessage || '';
    var calloutDelay = parseInt(theme.calloutDelay) || 3;
    var disclaimerText = theme.disclaimerText || '';

    var position = config.position || 'bottom-right';
    var posRight = position.includes('right') ? '20px' : 'auto';
    var posLeft = position.includes('left') ? '20px' : 'auto';

    var style = document.createElement('style');
    style.textContent =
      ':root {' +
      '  --cb-primary: ' + activePrimaryColor + ';' +
      '  --cb-header-bg: ' + activeHeaderBg + ';' +
      '  --cb-header-text: ' + preset.headerText + ';' +
      '  --cb-user-bubble-bg: ' + activeUserBubbleBg + ';' +
      '  --cb-user-bubble-text: ' + preset.userBubbleText + ';' +
      '  --cb-bot-bubble-bg: ' + activeBotBubbleBg + ';' +
      '  --cb-bot-bubble-text: ' + preset.botBubbleText + ';' +
      '  --cb-border-radius: ' + activeBorderRadius + ';' +
      '  --cb-font: ' + activeFont + ';' +
      '  --cb-box-shadow: ' + preset.boxShadow + ';' +
      '}' +
      '.cb-btn{position:fixed;bottom:20px;right:'+posRight+';left:'+posLeft+';width:60px;height:60px;border-radius:50%;background:var(--cb-primary);border:none;cursor:pointer;box-shadow:0 4px 20px rgba(0,0,0,.15);z-index:99998;display:flex;align-items:center;justify-content:center;transition:transform .3s,box-shadow .3s;padding:0}' +
      '.cb-btn:hover{transform:scale(1.1);box-shadow:0 6px 25px rgba(0,0,0,.2)}' +
      '.cb-btn svg{width:28px;height:28px;fill:#fff}' +
      '.cb-box{position:fixed;bottom:90px;right:'+posRight+';left:'+posLeft+';width:380px;max-width:calc(100vw - 40px);height:520px;max-height:calc(100vh - 120px);background:#fff;border-radius:var(--cb-border-radius);box-shadow:var(--cb-box-shadow);z-index:99999;display:none;flex-direction:column;overflow:hidden;font-family:var(--cb-font)}' +
      '.cb-box.open{display:flex;animation:cb-up .3s ease}' +
      '@keyframes cb-up{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}' +
      '.cb-hdr{background:var(--cb-header-bg);color:var(--cb-header-text);padding:16px 20px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid rgba(0,0,0,0.05)}' +
      '.cb-hdr-t{font-size:16px;font-weight:600}' +
      '.cb-hdr-x{background:none;border:none;color:inherit;cursor:pointer;font-size:20px;padding:0 4px;opacity:.8}' +
      '.cb-hdr-x:hover{opacity:1}' +
      '.cb-msgs{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:12px;background:' + (templateId === 'dark_mode' ? '#1e293b' : '#fff') + '}' +
      '.cb-msg-row{display:flex;align-items:flex-end;gap:8px;width:100%;animation:cb-up .2s ease}' +
      '.cb-msg-row.user{justify-content:flex-end}' +
      '.cb-msg-row.bot{justify-content:flex-start}' +
      '.cb-msg-avatar{width:28px;height:28px;border-radius:50%;object-fit:cover;flex-shrink:0}' +
      '.cb-m{max-width:75%;padding:10px 14px;border-radius:var(--cb-border-radius);font-size:14px;line-height:1.5;word-wrap:break-word;white-space:pre-wrap}' +
      '.cb-m.user{background:var(--cb-user-bubble-bg);color:var(--cb-user-bubble-text);border-bottom-right-radius:4px}' +
      '.cb-m.bot{background:var(--cb-bot-bubble-bg);color:var(--cb-bot-bubble-text);border-bottom-left-radius:4px}' +
      '.cb-typing-indicator{display:flex;align-items:center;gap:4px;padding:6px 10px;height:12px}' +
      '.cb-typing-dot{width:6px;height:6px;background:currentColor;border-radius:50%;opacity:.4;animation:cb-bounce 1.4s infinite both}' +
      '.cb-typing-dot:nth-child(2){animation-delay:.2s}' +
      '.cb-typing-dot:nth-child(3){animation-delay:.4s}' +
      '@keyframes cb-bounce{0%,80%,100%{transform:scale(0.6);opacity:.4}40%{transform:scale(1);opacity:1}}' +
      '.cb-callout{position:fixed;bottom:90px;right:'+posRight+';left:'+posLeft+';background:#fff;color:#0f172a;padding:10px 14px;border-radius:12px;box-shadow:0 4px 16px rgba(0,0,0,.12);z-index:99997;font-size:13px;font-family:var(--cb-font);max-width:250px;display:flex;align-items:center;gap:8px;border:1px solid #e2e8f0;cursor:pointer;animation:cb-up .3s ease}' +
      '.cb-callout-close{background:none;border:none;color:#94a3b8;cursor:pointer;font-size:14px;padding:0;margin-left:auto;line-height:1}' +
      '.cb-callout-close:hover{color:#64748b}' +
      '.cb-disclaimer{font-size:10px;color:#94a3b8;text-align:center;padding:4px 16px 8px;background:none;font-family:inherit}' +
      '.cb-inp{flex:1;border:1px solid #e2e8f0;border-radius:8px;padding:10px 14px;font-size:14px;outline:none;resize:none;font-family:inherit;background:' + (templateId === 'dark_mode' ? '#1e293b' : '#fff') + ';color:' + (templateId === 'dark_mode' ? '#f8fafc' : '#1e293b') + '}' +
      '.cb-inp:focus{border-color:var(--cb-primary);box-shadow:0 0 0 2px var(--cb-primary)20}' +
      '.cb-snd{background:var(--cb-primary);border:none;border-radius:8px;padding:10px 16px;cursor:pointer;display:flex;align-items:center;justify-content:center}' +
      '.cb-snd:disabled{opacity:.5;cursor:not-allowed}' +
      '.cb-snd svg{width:18px;height:18px;fill:#fff}' +
      '.cb-chip{background:' + (templateId === 'dark_mode' ? '#334155' : '#f1f5f9') + ';color:var(--cb-primary);border:1px solid ' + (templateId === 'dark_mode' ? '#475569' : '#e2e8f0') + ';padding:6px 12px;border-radius:16px;font-size:12px;cursor:pointer;transition:background 0.2s, transform 0.1s;font-family:inherit;font-weight:500;text-align:left}' +
      '.cb-chip:hover{background:' + (templateId === 'dark_mode' ? '#475569' : '#e2e8f0') + ';transform:translateY(-1px)}' +
      '@media(max-width:480px){.cb-box{width:calc(100vw - 20px);height:calc(100vh - 100px);right:10px;left:10px;bottom:80px}}';
    document.head.appendChild(style);

    var btn = document.createElement('button');
    btn.className = 'cb-btn';
    
    if (activeLauncherIcon) {
      btn.innerHTML = '<img src="' + activeLauncherIcon + '" style="width:100%;height:100%;border-radius:50%;object-fit:cover;" />';
    } else {
      btn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/></svg>';
    }
    btn.setAttribute('aria-label','Open chat');
    document.body.appendChild(btn);

    var box = document.createElement('div');
    box.className = 'cb-box';
    
    var logoHtml = activeLogo ? '<img src="' + activeLogo + '" style="height:28px;width:28px;border-radius:50%;margin-right:10px;object-fit:cover;"/>' : '';
    var disclaimerHtml = disclaimerText ? '<div class="cb-disclaimer">' + disclaimerText + '</div>' : '';

    box.innerHTML =
      '<div class="cb-hdr">' +
      '  <div style="display:flex;align-items:center;">' + logoHtml + '<span class="cb-hdr-t">' + (config.name||'Chat') + '</span></div>' +
      '  <button class="cb-hdr-x">&times;</button>' +
      '</div>' +
      '<div class="cb-msgs"></div>' +
      '<div class="cb-in-wrapper" style="border-top:1px solid #e2e8f0;background:' + (templateId === 'dark_mode' ? '#0f172a' : '#fff') + '">' +
      '  <div class="cb-in" style="border-top:none;padding:12px 16px 8px;display:flex;gap:8px;"><input class="cb-inp" placeholder="Type a message..."/><button class="cb-snd"><svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg></button></div>' +
      disclaimerHtml +
      '</div>';
    document.body.appendChild(box);

    var msgs = box.querySelector('.cb-msgs');
    var inp = box.querySelector('.cb-inp');
    var snd = box.querySelector('.cb-snd');
    var cls = box.querySelector('.cb-hdr-x');
    var isOpen = false, isSending = false;

    addMsg(config.welcomeMessage || 'Hello! How can I help you?', 'bot');

    // Add starter questions as clickable chips below the welcome message
    if (activeStarterQuestions && activeStarterQuestions.length > 0) {
      var chipsContainer = document.createElement('div');
      chipsContainer.className = 'cb-chips-container';
      chipsContainer.style.cssText = 'display:flex;flex-direction:column;align-items:flex-start;gap:6px;margin-top:4px;padding-left:36px;width:100%;';
      
      activeStarterQuestions.forEach(function(question) {
        var chip = document.createElement('button');
        chip.className = 'cb-chip';
        chip.textContent = question;
        chip.onclick = function() {
          inp.value = question;
          sendMsg();
          chipsContainer.remove();
        };
        chipsContainer.appendChild(chip);
      });
      msgs.appendChild(chipsContainer);
    }

    // Callout Notification Bubble
    if (calloutMsg && !localStorage.getItem('cb_callout_dismissed')) {
      setTimeout(function() {
        if (!isOpen) {
          var callout = document.createElement('div');
          callout.className = 'cb-callout';
          callout.innerHTML = '<span>' + calloutMsg + '</span><button class="cb-callout-close">&times;</button>';
          document.body.appendChild(callout);
          
          callout.querySelector('.cb-callout-close').onclick = function(e) {
            e.stopPropagation();
            callout.remove();
            localStorage.setItem('cb_callout_dismissed', 'true');
          };
          callout.onclick = function() {
            callout.remove();
            btn.click();
          };
        }
      }, calloutDelay * 1000);
    }

    btn.onclick = function() { 
      isOpen = !isOpen; 
      box.classList.toggle('open', isOpen); 
      if(isOpen) {
        inp.focus(); 
        var callout = document.querySelector('.cb-callout');
        if (callout) callout.remove();
      }
    };
    cls.onclick = function() { isOpen = false; box.classList.remove('open'); };

    function addMsg(text, role) {
      var row = document.createElement('div');
      row.className = 'cb-msg-row ' + role;

      if (role === 'bot') {
        if (activeBotAvatar) {
          var img = document.createElement('img');
          img.className = 'cb-msg-avatar';
          img.src = activeBotAvatar;
          row.appendChild(img);
        } else {
          var placeholder = document.createElement('div');
          placeholder.className = 'cb-msg-avatar';
          placeholder.style.cssText = 'background:var(--cb-primary);width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-size:10px;font-weight:bold;';
          placeholder.textContent = (config.name || 'AI').substring(0, 2).toUpperCase();
          row.appendChild(placeholder);
        }
      }

      var m = document.createElement('div');
      m.className = 'cb-m ' + role;
      m.textContent = text;
      row.appendChild(m);
      msgs.appendChild(row);
      msgs.scrollTop = msgs.scrollHeight;
      return m;
    }

    function sendMsg() {
      var text = inp.value.trim();
      if (!text || isSending) return;
      
      var chips = msgs.querySelector('.cb-chips-container');
      if (chips) chips.remove();

      addMsg(text, 'user');
      inp.value = '';
      isSending = true;
      snd.disabled = true;

      // Create bot message row with thinking animation
      var botRow = document.createElement('div');
      botRow.className = 'cb-msg-row bot';
      
      if (activeBotAvatar) {
        var img = document.createElement('img');
        img.className = 'cb-msg-avatar';
        img.src = activeBotAvatar;
        botRow.appendChild(img);
      } else {
        var placeholder = document.createElement('div');
        placeholder.className = 'cb-msg-avatar';
        placeholder.style.cssText = 'background:var(--cb-primary);width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-size:10px;font-weight:bold;';
        placeholder.textContent = (config.name || 'AI').substring(0, 2).toUpperCase();
        botRow.appendChild(placeholder);
      }

      var botMsg = document.createElement('div');
      botMsg.className = 'cb-m bot';
      
      if (enableThinking) {
        botMsg.innerHTML = '<div class="cb-typing-indicator"><div class="cb-typing-dot"></div><div class="cb-typing-dot"></div><div class="cb-typing-dot"></div></div>';
      } else {
        botMsg.textContent = '';
      }

      botRow.appendChild(botMsg);
      msgs.appendChild(botRow);
      msgs.scrollTop = msgs.scrollHeight;

      var isFirstToken = true;

      fetch(SERVER_URL + '/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, sessionId: sessionId, botId: config.id, pageUrl: window.location.href })
      }).then(function(response) {
        var reader = response.body.getReader();
        var decoder = new TextDecoder();
        var buffer = '';

        function read() {
          reader.read().then(function(result) {
            if (result.done) {
              isSending = false;
              snd.disabled = false;
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
                  if (isFirstToken) {
                    botMsg.innerHTML = '';
                    isFirstToken = false;
                  }
                  botMsg.textContent += data.content;
                  msgs.scrollTop = msgs.scrollHeight;
                } else if (data.type === 'start' && data.sessionId) {
                  sessionId = data.sessionId;
                  localStorage.setItem(sessionKey, sessionId);
                } else if (data.type === 'error') {
                  if (isFirstToken) botMsg.innerHTML = '';
                  botMsg.textContent = 'Sorry, something went wrong.';
                }
              } catch(e) {}
            }
            read();
          }).catch(function() {
            if (isFirstToken) botMsg.innerHTML = '';
            if (!botMsg.textContent) botMsg.textContent = 'Connection error. Please try again.';
            isSending = false;
            snd.disabled = false;
          });
        }
        read();
      }).catch(function() {
        if (isFirstToken) botMsg.innerHTML = '';
        botMsg.textContent = 'Connection error. Please try again.';
        isSending = false;
        snd.disabled = false;
      });
    }

    snd.onclick = sendMsg;
    inp.onkeypress = function(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); } };
  }
})();

`;

  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.send(widgetScript);
});

module.exports = router;
