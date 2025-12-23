
const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const { Redis } = require('@upstash/redis');
const crypto = require('crypto');
const config = require('./config');

const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

module.exports = async (req, res) => {
    const token = process.env.BOT_TOKEN;
    if (!token) return res.status(200).send('Bot Token missing');
    const bot = new Telegraf(token);

    const isOwner = (id) => id.toString() === config.ownerId;

    // --- MENU BUTTONS ---
    const getMenu = (userId) => {
        const buttons = [
            [Markup.button.callback('📊 Info Sistem', 'info_user')],
            [Markup.button.callback('👤 Owner', 'view_owner')],
            [Markup.button.callback('🎟️ Upload Token VIP', 'upload_token')]
        ];
        if (isOwner(userId)) {
            buttons.unshift([Markup.button.callback('➕ Tambah Key', 'setup_key'), Markup.button.callback('📜 List Keys', 'list_keys')]);
        }
        return Markup.inlineKeyboard(buttons);
    };

    bot.start((ctx) => {
        const msg = isOwner(ctx.from.id) ? "Halo Boss! Gunakan /adduser untuk buat token VIP." : "Halo! Selamat datang di XdpzQ-AI.";
        ctx.replyWithMarkdown(msg, getMenu(ctx.from.id));
    });

    // --- OWNER ONLY: ADD VIP ---
    bot.command('adduser', async (ctx) => {
        if (!isOwner(ctx.from.id)) return;
        await redis.set(`state:${ctx.from.id}`, 'vip_step_1', { ex: 300 });
        ctx.reply("🛠️ *Mode VIP*\n\nMasukkan Nama AI:");
    });

    // --- USER: UPLOAD TOKEN ---
    bot.action('upload_token', async (ctx) => {
        await redis.set(`state:${ctx.from.id}`, 'waiting_token', { ex: 300 });
        ctx.answerCbQuery();
        ctx.reply("🎟️ Masukkan Token VIP Anda:");
    });

    // --- HANDLER PESAN ---
    bot.on('text', async (ctx) => {
        const userId = ctx.from.id;
        const text = ctx.message.text;
        const state = await redis.get(`state:${userId}`);

        // Logic Buat Token (Step 1 & 2)
        if (state === 'vip_step_1' && isOwner(userId)) {
            await redis.set(`temp_vip:${userId}`, JSON.stringify({ aiName: text }));
            await redis.set(`state:${userId}`, 'vip_step_2', { ex: 300 });
            return ctx.reply(`Nama AI: ${text}\n\nMasukkan Nama Owner VIP-nya:`);
        }
        if (state === 'vip_step_2' && isOwner(userId)) {
            const tempData = await redis.get(`temp_vip:${userId}`);
            const tokenVIP = crypto.randomBytes(3).toString('hex').toUpperCase();
            await redis.set(`vip_token:${tokenVIP}`, { aiName: tempData.aiName, ownerName: text });
            await redis.del(`state:${userId}`);
            return ctx.replyWithMarkdown(`✅ *VIP TOKEN: \`${tokenVIP}\`*\nAI: ${tempData.aiName}\nOwner: ${text}`);
        }

        // Logic Upload Token
        if (state === 'waiting_token') {
            const data = await redis.get(`vip_token:${text.toUpperCase()}`);
            if (!data) return ctx.reply("❌ Token salah!");
            await redis.set(`user_vip:${userId}`, text.toUpperCase());
            await redis.del(`state:${userId}`);
            return ctx.reply(`✅ Berhasil! Nama AI: ${data.aiName}, Owner AI: ${data.ownerName}`);
        }

        // Logic Tambah API Key
        if (state === 'awaiting_key' && isOwner(userId)) {
            await redis.sadd('apikeys:pool', text.trim());
            await redis.del(`state:${userId}`);
            return ctx.reply('✅ Key ditambahkan!');
        }

        if (text.startsWith('/')) return;

        // --- PROSES CHAT AI ---
        const keys = await redis.smembers('apikeys:pool');
        if (keys.length === 0) return ctx.reply('⚠️ API Key Pool Kosong.');

        // AMBIL IDENTITAS (DEFAULT ATAU VIP)
        let currentAiName = config.botName;
        let currentOwnerName = config.defaultOwnerName;

        const userVipToken = await redis.get(`user_vip:${userId}`);
        if (userVipToken) {
            const vipData = await redis.get(`vip_token:${userVipToken}`);
            if (vipData) {
                currentAiName = vipData.aiName;
                currentOwnerName = vipData.ownerName;
            }
        }

        await ctx.sendChatAction('typing');

        // Logic Failover API
        let success = false;
        let attempt = 0;
        while (!success && attempt < Math.min(keys.length, 3)) {
            const currentKey = keys[attempt];
            try {
                const response = await axios.post(
                    'https://openrouter.ai/api/v1/chat/completions',
                    {
                        model: 'deepseek/deepseek-chat',
                        messages: [
                            // INI KUNCINYA: Memasukkan Persona Dinamis
                            { role: 'system', content: config.persona(currentAiName, currentOwnerName) },
                            { role: 'user', content: text }
                        ]
                    },
                    { headers: { 'Authorization': `Bearer ${currentKey}` }, timeout: 45000 }
                );

                const aiResponse = response.data.choices?.[0]?.message?.content;
                await ctx.reply(aiResponse);

                // Kirim Script File
                const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
                let match;
                while ((match = codeBlockRegex.exec(aiResponse)) !== null) {
                    await ctx.replyWithDocument({
                        source: Buffer.from(match[2].trim(), 'utf-8'),
                        filename: `script_${Date.now()}.txt`
                    });
                }
                success = true;
            } catch (error) {
                if (error.response?.status === 401 || error.response?.status === 402) {
                    await redis.srem('apikeys:pool', currentKey);
                    attempt++;
                } else { break; }
            }
        }
        if (!success) ctx.reply('❌ Gagal.');
    });

    // Handler buttons (setup_key, list_keys, info_user, view_owner) ...
    // ... (sesuai kode sebelumnya)

    if (req.method === 'POST') {
        await bot.handleUpdate(req.body);
        res.status(200).send('OK');
    } else {
        res.status(200).send('Bot Running');
    }
};
