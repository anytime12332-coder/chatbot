const express = require('express');
const prisma = require('../lib/prisma');

const router = express.Router();

// GET /widget/config/:botId
router.get('/config/:botId', async (req, res) => {
  try {
    const chatbot = await prisma.chatbot.findUnique({
      where: { id: req.params.botId },
      select: { id: true, name: true, welcomeMessage: true, primaryColor: true, position: true, isActive: true },
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
      select: { id: true, name: true, welcomeMessage: true, primaryColor: true, position: true, isActive: true },
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
    var primaryColor = config.primaryColor || '#6366f1';
    var position = config.position || 'bottom-right';
    var posRight = position.includes('right') ? '20px' : 'auto';
    var posLeft = position.includes('left') ? '20px' : 'auto';

    var style = document.createElement('style');
    style.textContent =
      '.cb-btn{position:fixed;bottom:20px;right:'+posRight+';left:'+posLeft+';width:60px;height:60px;border-radius:50%;background:'+primaryColor+';border:none;cursor:pointer;box-shadow:0 4px 20px rgba(0,0,0,.15);z-index:99998;display:flex;align-items:center;justify-content:center;transition:transform .3s,box-shadow .3s}'+
      '.cb-btn:hover{transform:scale(1.1);box-shadow:0 6px 25px rgba(0,0,0,.2)}'+
      '.cb-btn svg{width:28px;height:28px;fill:#fff}'+
      '.cb-box{position:fixed;bottom:90px;right:'+posRight+';left:'+posLeft+';width:380px;max-width:calc(100vw - 40px);height:520px;max-height:calc(100vh - 120px);background:#fff;border-radius:16px;box-shadow:0 10px 40px rgba(0,0,0,.15);z-index:99999;display:none;flex-direction:column;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}'+
      '.cb-box.open{display:flex;animation:cb-up .3s ease}'+
      '@keyframes cb-up{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}'+
      '.cb-hdr{background:'+primaryColor+';color:#fff;padding:16px 20px;display:flex;align-items:center;justify-content:space-between}'+
      '.cb-hdr-t{font-size:16px;font-weight:600}'+
      '.cb-hdr-x{background:none;border:none;color:#fff;cursor:pointer;font-size:20px;padding:0 4px;opacity:.8}'+
      '.cb-hdr-x:hover{opacity:1}'+
      '.cb-msgs{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:12px}'+
      '.cb-m{max-width:85%;padding:10px 14px;border-radius:12px;font-size:14px;line-height:1.5;word-wrap:break-word;white-space:pre-wrap}'+
      '.cb-m.user{align-self:flex-end;background:'+primaryColor+';color:#fff;border-bottom-right-radius:4px}'+
      '.cb-m.bot{align-self:flex-start;background:#f1f5f9;color:#1e293b;border-bottom-left-radius:4px}'+
      '.cb-m.typing{align-self:flex-start;background:#f1f5f9;color:#94a3b8;font-style:italic}'+
      '.cb-in{padding:12px 16px;border-top:1px solid #e2e8f0;display:flex;gap:8px}'+
      '.cb-inp{flex:1;border:1px solid #e2e8f0;border-radius:8px;padding:10px 14px;font-size:14px;outline:none;resize:none;font-family:inherit}'+
      '.cb-inp:focus{border-color:'+primaryColor+';box-shadow:0 0 0 2px '+primaryColor+'20}'+
      '.cb-snd{background:'+primaryColor+';border:none;border-radius:8px;padding:10px 16px;cursor:pointer;display:flex;align-items:center;justify-content:center}'+
      '.cb-snd:disabled{opacity:.5;cursor:not-allowed}'+
      '.cb-snd svg{width:18px;height:18px;fill:#fff}'+
      '@media(max-width:480px){.cb-box{width:calc(100vw - 20px);height:calc(100vh - 100px);right:10px;left:10px;bottom:80px}}';
    document.head.appendChild(style);

    var btn = document.createElement('button');
    btn.className = 'cb-btn';
    btn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/></svg>';
    btn.setAttribute('aria-label','Open chat');
    document.body.appendChild(btn);

    var box = document.createElement('div');
    box.className = 'cb-box';
    box.innerHTML =
      '<div class="cb-hdr"><span class="cb-hdr-t">'+(config.name||'Chat')+'</span><button class="cb-hdr-x">&times;</button></div>'+
      '<div class="cb-msgs"></div>'+
      '<div class="cb-in"><input class="cb-inp" placeholder="Type a message..."/><button class="cb-snd"><svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg></button></div>';
    document.body.appendChild(box);

    var msgs = box.querySelector('.cb-msgs');
    var inp = box.querySelector('.cb-inp');
    var snd = box.querySelector('.cb-snd');
    var cls = box.querySelector('.cb-hdr-x');
    var isOpen = false, isSending = false;

    addMsg(config.welcomeMessage || 'Hello! How can I help you?', 'bot');

    btn.onclick = function() { isOpen = !isOpen; box.classList.toggle('open', isOpen); if(isOpen) inp.focus(); };
    cls.onclick = function() { isOpen = false; box.classList.remove('open'); };

    function addMsg(text, role) {
      var m = document.createElement('div');
      m.className = 'cb-m ' + role;
      m.textContent = text;
      msgs.appendChild(m);
      msgs.scrollTop = msgs.scrollHeight;
      return m;
    }

    function sendMsg() {
      var text = inp.value.trim();
      if (!text || isSending) return;
      addMsg(text, 'user');
      inp.value = '';
      isSending = true;
      snd.disabled = true;

      // Create bot message element for streaming
      var botMsg = document.createElement('div');
      botMsg.className = 'cb-m bot';
      botMsg.textContent = '';
      msgs.appendChild(botMsg);
      msgs.scrollTop = msgs.scrollHeight;

      // Use streaming endpoint
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
                  botMsg.textContent += data.content;
                  msgs.scrollTop = msgs.scrollHeight;
                } else if (data.type === 'start' && data.sessionId) {
                  sessionId = data.sessionId;
                  localStorage.setItem(sessionKey, sessionId);
                } else if (data.type === 'error') {
                  botMsg.textContent = 'Sorry, something went wrong.';
                }
              } catch(e) {}
            }
            read();
          }).catch(function() {
            if (!botMsg.textContent) botMsg.textContent = 'Connection error. Please try again.';
            isSending = false;
            snd.disabled = false;
          });
        }
        read();
      }).catch(function() {
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
