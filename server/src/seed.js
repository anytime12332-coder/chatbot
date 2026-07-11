require('dotenv').config();
const bcrypt = require('bcryptjs');
const prisma = require('./lib/prisma');

async function seed() {
  console.log('\ud83c\udf31 Seeding database...');

  const email = process.env.ADMIN_EMAIL || 'admin@example.com';
  const password = process.env.ADMIN_PASSWORD || 'admin123456';

  const hashedPassword = await bcrypt.hash(password, 12);

  const admin = await prisma.admin.upsert({
    where: { email },
    update: { password: hashedPassword },
    create: {
      email,
      password: hashedPassword,
      name: 'Admin',
    },
  });

  console.log(`\u2705 Admin user created: ${admin.email}`);

  // Create a default chatbot for the admin
  const existingBot = await prisma.chatbot.findFirst({ where: { adminId: admin.id } });
  if (!existingBot) {
    const chatbot = await prisma.chatbot.create({
      data: {
        name: 'My First Chatbot',
        businessName: 'My Business',
        businessInfo: 'We are a company that provides excellent services.',
        systemPrompt: 'You are a helpful customer support assistant. Be friendly, concise, and helpful. Answer questions based on the business information provided.',
        welcomeMessage: 'Hello! \ud83d\udc4b How can I help you today?',
        primaryColor: '#6366f1',
        position: 'bottom-right',
        adminId: admin.id,
        apiConfig: {
          create: {
            provider: 'openai',
            model: 'gpt-3.5-turbo',
            maxTokens: 1024,
            temperature: 0.7,
          },
        },
      },
    });
    console.log(`\u2705 Default chatbot created: ${chatbot.name} (${chatbot.id})`);
  } else {
    console.log('\u2139\ufe0f  Chatbot already exists, skipping...');
  }

  console.log(`\n\ud83c\udf89 Seeding complete!`);
  console.log(`\n\ud83d\udce7 Login with: ${email} / ${password}`);

  await prisma.$disconnect();
}

seed().catch((e) => {
  console.error('Seed error:', e);
  process.exit(1);
});
