import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function check() {
  try {
    const users = await prisma.user.findMany({ 
      select: { id: true, githubUsername: true, email: true, createdAt: true } 
    });
    console.log('=== 数据库用户 ===');
    console.log('总数:', users.length);
    for (const u of users) {
      console.log(`  - ${u.githubUsername} (${u.email}) - ${u.id}`);
    }
    
    const accounts = await prisma.account.findMany({
      select: { id: true, userId: true, publicKey: true }
    });
    console.log('\n=== 账户 ===');
    console.log('总数:', accounts.length);
    for (const a of accounts) {
      console.log(`  - Account: ${a.id}, User: ${a.userId}`);
    }
  } catch (e) {
    console.error('Error:', e);
  } finally {
    await prisma.$disconnect();
  }
}

check();
