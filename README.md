# AI Chatbot SaaS Platform

A production-ready AI chatbot platform where a single client can create **multiple chatbots**, each with its own embed code, system prompt, business details, API configuration, conversations inbox, and analytics dashboard.

## Features

### Multi-Bot Management
- **Create unlimited chatbots** from one admin panel
- Each bot gets its own unique **embed code** and **Bot ID**
- Separate **system prompt**, **business details**, and **AI config** per bot
- Per-bot **analytics dashboard** with dedicated charts
- Per-bot **conversation inbox**
- Global **overview dashboard** across all bots

### AI Providers
- **OpenAI** (GPT-3.5, GPT-4, GPT-4o)
- **Google Gemini** (1.5 Flash, 1.5 Pro, 2.0 Flash)
- **Anthropic Claude** (Haiku, Sonnet, Opus)
- **OpenRouter** (100+ models)
- **Custom API** (any OpenAI-compatible endpoint)
- Each bot can use a **different provider and model**

### Streaming (SSE)
- Real-time **word-by-word streaming** responses
- Server-Sent Events for the widget and API
- Supports OpenAI, Claude, OpenRouter streaming
- Gemini falls back to non-streaming gracefully

### Security
- **AES-256-GCM encryption** for all API keys at rest
- JWT authentication with bcrypt password hashing
- Rate limiting (30 msg/min per IP)
- Helmet security headers

### Performance
- **SQL-optimized** dashboard queries (GROUP BY instead of fetch-all)
- **Request queue** with concurrency control (10 simultaneous AI calls)
- Database connection pooling via Prisma
- Handles high concurrent message load without crashing

### Dashboard
- Global overview with all-bots summary
- Per-bot stats: conversations, messages, tokens, response times
- 3 interactive charts per bot (messages, conversations, response times)
- Recent conversations with preview
- Conversation export to JSON

## Tech Stack

| Layer | Technology |
|-------|------------|
| Backend | Node.js, Express.js, Prisma ORM |
| Database | PostgreSQL |
| Frontend | React 18, Vite, TailwindCSS, Recharts |
| Auth | JWT + bcrypt |
| Encryption | AES-256-GCM (Node.js crypto) |
| Streaming | Server-Sent Events (SSE) |
| Concurrency | p-queue |
| Deployment | Docker, Railway |

## Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL database

### Setup

```bash
# Backend
cd server
npm install
cp .env.example .env
# Edit .env with your database URL, JWT secret, encryption key
npx prisma migrate deploy
npm run seed
npm run dev

# Frontend (new terminal)
cd client
npm install
npm run dev
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| DATABASE_URL | PostgreSQL connection string |
| JWT_SECRET | Secret for JWT tokens |
| ENCRYPTION_KEY | Secret for AES-256 API key encryption |
| ADMIN_EMAIL | Default admin email |
| ADMIN_PASSWORD | Default admin password |
| PORT | Server port (default: 3000) |

## Deploy to Railway

1. Push repo to GitLab/GitHub
2. Connect to Railway
3. Add PostgreSQL plugin
4. Set environment variables
5. Deploy!

## Embed Widget

Each chatbot gets a unique embed code:

```html
<script src="https://YOUR_DOMAIN/widget/embed.js" data-chatbot-id="BOT_ID_HERE"></script>
```

## API

### Standard Chat
```bash
POST /api/chat/message
{"message": "Hello!", "botId": "BOT_ID", "sessionId": "optional"}
```

### Streaming Chat (SSE)
```bash
POST /api/chat/stream
{"message": "Hello!", "botId": "BOT_ID", "sessionId": "optional"}
```

## Project Structure

```
├── server/
│   ├── prisma/          # Schema + migrations
│   ├── src/
│   │   ├── lib/         # prisma, auth, encryption, aiProviders, queue
│   │   ├── routes/      # auth, chatbot, apiConfig, chat, dashboard, widget
│   │   ├── seed.js
│   │   └── index.js
│   └── package.json
├── client/
│   ├── src/
│   │   ├── components/  # Layout (with bot switcher)
│   │   ├── context/     # AuthContext, BotContext
│   │   ├── pages/       # Overview, ChatbotList, BotDashboard, BotConfig,
│   │   │                # ApiConfig, EmbedCode, Conversations, Settings
│   │   └── lib/         # API client
│   └── package.json
├── Dockerfile
├── railway.toml
└── README.md
```
