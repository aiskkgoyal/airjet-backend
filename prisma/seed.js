const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  const key = 'main_piece';
  const existing = await prisma.counter.findUnique({ where: { key } });

  if (!existing) {
    await prisma.counter.create({
      data: { key, value: 0 }
    });
    console.log('Created counter:', key);
  }

  const admin = await prisma.user.findUnique({
    where: { username: 'admin' }
  });

  if (!admin) {
    const hashedPassword = await bcrypt.hash('admin123', 10);

    await prisma.user.create({
      data: {
        username: 'admin',
        password: hashedPassword,
        display: 'Administrator',
        role: 'admin'
      }
    });

    console.log('Created admin user (username: admin, password: admin123)');
  }
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });