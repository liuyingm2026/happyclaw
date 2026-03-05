/**
 * 创建测试用户并生成登录 Token
 * 用于绕过手机扫码登录进行测试
 */
import 'dotenv/config';
import { db } from '../storage/db';
import { inTx } from '../storage/inTx';
import * as jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'happy-dev-secret-key';

async function createTestUser() {
    console.log('=== 创建测试用户 ===\n');

    try {
        // 检查是否已存在测试用户
        let user = await db.user.findFirst({
            where: { githubUsername: 'test-user' }
        });

        if (user) {
            console.log('测试用户已存在:', user.id);
        } else {
            // 创建测试用户
            user = await db.user.create({
                data: {
                    githubUsername: 'test-user',
                    email: 'test@example.com',
                    name: 'Test User',
                }
            });
            console.log('✅ 创建测试用户:', user.id);
        }

        // 创建或更新账户
        let account = await db.account.findFirst({
            where: { userId: user.id }
        });

        if (!account) {
            account = await db.account.create({
                data: {
                    userId: user.id,
                    publicKey: Buffer.from('test-public-key').toString('base64'),
                    profile: {},
                }
            });
            console.log('✅ 创建账户:', account.id);
        } else {
            console.log('账户已存在:', account.id);
        }

        // 生成 JWT Token
        const token = jwt.sign(
            { 
                userId: user.id, 
                githubUsername: user.githubUsername,
                iat: Math.floor(Date.now() / 1000)
            },
            JWT_SECRET,
            { expiresIn: '30d' }
        );

        console.log('\n=== 测试登录信息 ===');
        console.log('用户ID:', user.id);
        console.log('用户名:', user.githubUsername);
        console.log('\n🔑 Token (复制下面的 token):');
        console.log('─'.repeat(60));
        console.log(token);
        console.log('─'.repeat(60));

        return { user, account, token };
    } catch (error) {
        console.error('错误:', error);
        throw error;
    }
}

createTestUser()
    .then(() => {
        console.log('\n✅ 完成！请复制上面的 Token 用于测试登录。');
        process.exit(0);
    })
    .catch((e) => {
        console.error('❌ 失败:', e);
        process.exit(1);
    });
