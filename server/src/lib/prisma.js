const { PrismaClient } = require('@prisma/client');

const dbUrl = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/chatbot';

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  datasources: {
    db: {
      url: dbUrl,
    },
  },
});

module.exports = prisma;
