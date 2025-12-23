
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

    // --- FITUR OWNER HIDDEN: ADD USER VIP ---
    bot.command('adduser', async (ctx) => {
        if (!isOwner(ctx.from.id)) return;
        await redis.set(`state:${ctx.from.id}`, 'vip_step_1', { ex: 300 });
        ctx.reply("🛠️ *Mode Pembuatan Token VIP*\n\nMasukkan Nama AI yang diinginkan:");
    });

    // --- FITUR USER: UPLOAD TOKEN ---
    bot.action('upload_token', async (ctx) => {
        await redis.set(`state:${ctx.from.id}`, 'waiting_token', { ex: 300 });
        ctx.answerCbQuery();
        ctx.reply("🎟️ Silakan masukkan Token VIP Anda:");
    });

    bot.action('view_owner', async (ctx) => {
        const userId = ctx.from.id;
        // Cek apakah user punya VIP Session
        const vipToken = await redis.get(`user_vip:${userId}`);
        let ownerName = config.owner.name;
        
        if (vipToken) {
            const vipData = await redis.get(`vip_token:${vipToken}`);
            if (vipData) ownerName = vipData.ownerName;
        }

        ctx.answerCbQuery();
        ctx.replyWithMarkdown(`👤 *OWNER INFO*\n\nNama: ${ownerName}\nWhatsApp: ${config.owner.whatsapp}`, 
        Markup.inlineKeyboard([[Markup.button.url('Hubungi via WhatsApp', config.owner.waLink)]]));
    });

    // Fitur lainnya (setup_key, list_keys, info_user) tetap sama...
    bot.action('info_user', async (ctx) => {
        const keys = await redis.smembers('apikeys:pool');
        const vipToken = await redis.get(`user_vip:${ctx.from.id}`);
        const statusVIP = vipToken ? `✅ VIP Aktif (${vipToken})` : "❌ Standar";
        ctx.answerCbQuery();
        ctx.replyWithMarkdown(`📊 *STATUS SISTEM*\n\n🔑 API Pool: ${keys.length}\n🌟 Status Akun: ${statusVIP}`, getMenu(ctx.from.id));
    });

    // --- HANDLER PESAN & STATE ---
    bot.on('text', async (ctx) => {
        const userId = ctx.from.id;
        const text = ctx.message.text;
        const state = await redis.get(`state:${userId}`);

        // STEP 1 OWNER: Input Nama AI
        if (state === 'vip_step_1' && isOwner(userId)) {
            await redis.set(`temp_vip:${userId}`, JSON.stringify({ aiName: text }));
            await redis.set(`state:${userId}`, 'vip_step_2', { ex: 300 });
            return ctx.reply(`Nama AI: ${text}\n\nSekarang masukkan Nama Owner VIP:`);
        }

        // STEP 2 OWNER: Input Nama Owner & Generate Token
        if (state === 'vip_step_2' && isOwner(userId)) {
            const tempData = await redis.get(`temp_vip:${userId}`);
            const { aiName } = tempData;
            const tokenVIP = crypto.randomBytes(3).toString('hex').toUpperCase(); // Contoh: A1B2C3

            await redis.set(`vip_token:${tokenVIP}`, { aiName: aiName, ownerName: text });
            await redis.del(`state:${userId}`);
            await redis.del(`temp_vip:${userId}`);

            return ctx.replyWithMarkdown(`✅ *TOKEN VIP BERHASIL DIBUAT!*\n\nToken: \`${tokenVIP}\`\nAI Name: ${aiName}\nOwner Name: ${text}\n\nBerikan token ini ke user.`);
        }

        // STEP USER: Upload Token
        if (state === 'waiting_token') {
            const vipData = await redis.get(`vip_token:${text.toUpperCase()}`);
            if (!vipData) return ctx.reply("❌ Token tidak valid atau sudah kadaluarsa!");
            
            await redis.set(`user_vip:${userId}`, text.toUpperCase());
            await redis.del(`state:${userId}`);
            return ctx.reply(`✅ VIP BERHASIL!\n\nNama AI Anda sekarang: ${vipData.aiName}\nNama Owner Anda sekarang: ${vipData.ownerName}`, getMenu(userId));
        }

        // --- HANDLER KEY MANAGEMENT (Yang sudah ada) ---
        if (state === 'awaiting_key' && isOwner(userId)) {
            await redis.sadd('apikeys:pool', text.trim());
            await redis.del(`state:${userId}`);
            return ctx.reply('✅ Key ditambahkan!', getMenu(userId));
        }

        if (text.startsWith('/')) return;

        // --- PROSES CHAT AI ---
        const keys = await redis.smembers('apikeys:pool');
        if (keys.length === 0) return ctx.reply('⚠️ API Key Pool Kosong.');

        // Ambil Profil Kustom (Jika VIP)
        const userVipToken = await redis.get(`user_vip:${userId}`);
        let currentAiName = config.botName;
        if (userVipToken) {
            const data = await redis.get(`vip_token:${userVipToken}`);
            if (data) currentAiName = data.aiName;
        }

        await ctx.sendChatAction('typing');

        // Logic Failover (Sama seperti sebelumnya)
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
                            { role: 'system', content: config.persona(currentAiName) },
                            { role: 'user', content: text }
                        ]
                    },
                    { headers: { 'Authorization': `Bearer ${currentKey}` }, timeout: 45000 }
                );

                const aiResponse = response.data.choices?.[0]?.message?.content;
                await ctx.reply(aiResponse);

                // Fitur kirim script file...
                const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
                let match;
                while ((match = codeBlockRegex.exec(aiResponse)) !== null) {
                    const code = match[2].trim();
                    await ctx.replyWithDocument({ source: Buffer.from(code, 'utf-8'), filename: `script_${Date.now()}.txt` });
                }
                success = true;
            } catch (error) {
                if (error.response?.status === 401 || error.response?.status === 402) {
                    await redis.srem('apikeys:pool', currentKey);
                    attempt++;
                } else { break; }
            }
        }
        if (!success) ctx.reply('❌ Sistem gangguan.');
    });

    if (req.method === 'POST') {
        await bot.handleUpdate(req.body);
        res.status(200).send('OK');
    } else {
        res.status(200).send('Bot Running');
    }
};
