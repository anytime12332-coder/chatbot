require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Behind a reverse proxy (Railway, Heroku, Nginx). Required so req.ip and
// express-rate-limit use the real client IP from X-Forwarded-For instead of
// the proxy IP (otherwise all users share one rate-limit bucket).
app.set('trust proxy', 1);

console.log('[Boot] Starting AI Chatbot Server...');
console.log('[Boot] NODE_ENV:', process.env.NODE_ENV);
console.log('[Boot] PORT:', PORT);
console.log('[Boot] DATABASE_URL:', process.env.DATABASE_URL ? 'SET (' + process.env.DATABASE_URL.substring(0, 30) + '...)' : 'NOT SET!');

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false,
}));

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    return callback(null, true);
  },
  credentials: true,
}));

const chatLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 30,
  message: { error: 'Too many messages, please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(generalLimiter);

app.use('/static', express.static(path.join(__dirname, '../public')));

// Health check - first route
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Load routes - NO try/catch so errors are visible in Railway logs
console.log('[Boot] Loading routes...');

function safeRequire(routePath, name) {
  try {
    const r = require(routePath);
    console.log(`[Boot] ✓ ${name} routes loaded`);
    return r;
  } catch (err) {
    console.error(`[Boot] ✗ Failed to load ${name} routes:`, err && err.message ? err.message : err);
    // return an empty router so app can still start and health checks pass
    const express = require('express');
    return express.Router();
  }
}

const authRoutes = safeRequire('./routes/auth', 'auth');
const chatbotRoutes = safeRequire('./routes/chatbot', 'chatbot');
const apiConfigRoutes = safeRequire('./routes/apiConfig', 'apiConfig');
const chatRoutes = safeRequire('./routes/chat', 'chat');
const dashboardRoutes = safeRequire('./routes/dashboard', 'dashboard');
const widgetRoutes = safeRequire('./routes/widget', 'widget');
const leadRoutes = safeRequire('./routes/lead', 'lead');
const ragRoutes = safeRequire('./routes/rag', 'RAG');
const voiceRoutes = safeRequire('./routes/voice', 'Voice');

app.use('/api/auth', authRoutes);
app.use('/api/chatbots', chatbotRoutes);
app.use('/api/api-config', apiConfigRoutes);
app.use('/api/chat', chatLimiter, chatRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/leads', leadRoutes);
app.use('/api/rag', ragRoutes);
app.use('/api/voice', voiceRoutes);
app.use('/widget', widgetRoutes);

console.log('[Boot] ✓ All routes registered');

// 404 for unknown API routes
app.all('/api/*', (req, res) => {
  res.status(404).json({ error: `API endpoint not found: ${req.method} ${req.path}` });
});

// Serve frontend in production
if (process.env.NODE_ENV === 'production') {
  const clientPath = path.join(__dirname, '../../client/dist');
  console.log('[Boot] Serving frontend from:', clientPath);
  app.use(express.static(clientPath));
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/widget/') || req.path === '/health') {
      return res.status(404).json({ error: 'Not found' });
    }
    res.sendFile(path.join(clientPath, 'index.html'));
  });
}

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Boot] ✓ Server running on port ${PORT}`);
  console.log(`[Boot] ✓ Health: http://localhost:${PORT}/health`);
  console.log('[Boot] ✓ Ready to accept requests');
});

server.on('error', (err) => {
  console.error('[Boot] Server failed to start:', err);
  process.exit(1);
});
