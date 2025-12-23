
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
    if (!token) return res.status(200).send('Token Missing');
    const bot = new Telegraf(token);

    const isOwner = (id) => id.toString() === config.ownerId;

    // --- GENERATOR MENU UTAMA ---
    const getMainMenu = (userId) => {
        const buttons = [
            [Markup.button.callback('📊 Info Sistem', 'info_user'), Markup.button.callback('👤 Owner', 'view_owner')],
            [Markup.button.callback('🎟️ Upload Token VIP', 'upload_token')]
        ];
        if (isOwner(userId)) {
            buttons.unshift([Markup.button.callback('➕ Tambah API Key', 'setup_key'), Markup.button.callback('📜 List Keys', 'list_keys')]);
        }
        return Markup.inlineKeyboard(buttons);
    };

    // --- COMMANDS ---
    bot.start((ctx) => {
        const msg = isOwner(ctx.from.id) ? "Halo Boss XdpzQ! Gunakan /adduser untuk buat VIP." : "Halo! Selamat datang di XdpzQ-AI.";
        ctx.replyWithMarkdown(msg, getMainMenu(ctx.from.id));
    });

    bot.command('adduser', async (ctx) => {
        if (!isOwner(ctx.from.id)) return;
        await redis.set(`state:${ctx.from.id}`, 'vip_1');
        ctx.reply("🛠️ *Mode VIP*\nMasukkan Nama AI yang diinginkan:");
    });

    bot.command('delkey', async (ctx) => {
        if (!isOwner(ctx.from.id)) return;
        const index = parseInt(ctx.payload) - 1;
        const keys = await redis.smembers('apikeys:pool');
        if (keys[index]) {
            await redis.srem('apikeys:pool', keys[index]);
            ctx.reply(`✅ Key nomor ${index+1} dihapus.`);
        } else {
            ctx.reply("Format: /delkey 1");
        }
    });

    // --- CALLBACK ACTIONS (TOMBOL) ---
    bot.action('setup_key', async (ctx) => {
        if (!isOwner(ctx.from.id)) return ctx.answerCbQuery('Akses Ditolak');
        await redis.set(`state:${ctx.from.id}`, 'awaiting_key');
        ctx.answerCbQuery();
        ctx.reply('Kirimkan API Key OpenRouter baru:');
    });

    bot.action('list_keys', async (ctx) => {
        if (!isOwner(ctx.from.id)) return ctx.answerCbQuery('Akses Ditolak');
        const keys = await redis.smembers('apikeys:pool');
        ctx.answerCbQuery();
        let txt = "📜 *LIST API KEY*\n\n";
        keys.forEach((k, i) => txt += `${i+1}. \`${k.substring(0,10)}...\`\n`);
        ctx.replyWithMarkdown(txt + "\nHapus dengan /delkey <nomor>");
    });

    bot.action('info_user', async (ctx) => {
        const keys = await redis.smembers('apikeys:pool');
        const vipToken = await redis.get(`user_vip:${ctx.from.id}`);
        ctx.answerCbQuery();
        ctx.replyWithMarkdown(`📊 *INFO SISTEM*\n\n🔑 API Pool: ${keys.length}\n🌟 Status: ${vipToken ? 'VIP Member' : 'Standar'}`);
    });

    bot.action('view_owner', async (ctx) => {
        let name = config.owner.name;
        const vipToken = await redis.get(`user_vip:${ctx.from.id}`);
        if (vipToken) {
            const data = await redis.get(`vip_token:${vipToken}`);
            if (data) name = data.ownerName;
        }
        ctx.answerCbQuery();
        ctx.replyWithMarkdown(`👤 *OWNER INFO*\n\nNama: ${name}\nWA: ${config.owner.whatsapp}`, 
        Markup.inlineKeyboard([[Markup.button.url('WhatsApp', config.owner.waLink)]]));
    });

    bot.action('upload_token', async (ctx) => {
        await redis.set(`state:${ctx.from.id}`, 'waiting_token');
        ctx.answerCbQuery();
        ctx.reply("🎟️ Silakan kirimkan Token VIP Anda:");
    });

    // --- HANDLER PESAN TEKS ---
    bot.on('text', async (ctx) => {
        const userId = ctx.from.id;
        const text = ctx.message.text;
        const state = await redis.get(`state:${userId}`);

        // 1. Logic Create VIP (Owner)
        if (state === 'vip_1' && isOwner(userId)) {
            await redis.set(`temp_vip:${userId}`, JSON.stringify({ aiName: text }));
            await redis.set(`state:${userId}`, 'vip_2');
            return ctx.reply("Nama AI Terinput. Sekarang masukkan Nama Owner VIP:");
        }
        if (state === 'vip_2' && isOwner(userId)) {
            const temp = await redis.get(`temp_vip:${userId}`);
            const tokenVIP = crypto.randomBytes(3).toString('hex').toUpperCase();
            await redis.set(`vip_token:${tokenVIP}`, { aiName: temp.aiName, ownerName: text });
            await redis.del(`state:${userId}`);
            return ctx.replyWithMarkdown(`✅ *TOKEN VIP: \`${tokenVIP}\`*\nAI: ${temp.aiName}\nOwner: ${text}`);
        }

        // 2. Logic Upload Token (User)
        if (state === 'waiting_token') {
            const data = await redis.get(`vip_token:${text.toUpperCase()}`);
            if (!data) return ctx.reply("❌ Token Salah!");
            await redis.set(`user_vip:${userId}`, text.toUpperCase());
            await redis.del(`state:${userId}`);
            return ctx.reply(`✅ VIP AKTIF!\nAI: ${data.aiName}\nOwner: ${data.ownerName}`);
        }

        // 3. Logic Tambah API Key (Owner)
        if (state === 'awaiting_key' && isOwner(userId)) {
            if (!text.startsWith('sk-or-')) return ctx.reply("❌ Salah format!");
            await redis.sadd('apikeys:pool', text.trim());
            await redis.del(`state:${userId}`);
            return ctx.reply("✅ Key ditambahkan!");
        }

        if (text.startsWith('/')) return;

        // --- 4. LOGIKA CHAT AI (SEMUA USER) ---
        const keys = await redis.smembers('apikeys:pool');
        if (keys.length === 0) return ctx.reply("⚠️ Bot sedang tidak memiliki API Key.");

        let aiName = config.botName;
        let ownerName = config.defaultOwnerName;
        const userVip = await redis.get(`user_vip:${userId}`);
        if (userVip) {
            const d = await redis.get(`vip_token:${userVip}`);
            if (d) { aiName = d.aiName; ownerName = d.ownerName; }
        }

        await ctx.sendChatAction('typing');

        let success = false;
        let attempt = 0;
        while (!success && attempt < Math.min(keys.length, 3)) {
            const currentKey = keys[attempt];
            try {
                const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
                    model: 'deepseek/deepseek-chat',
                    messages: [
                        { role: 'system', content: config.persona(aiName, ownerName) },
                        { role: 'user', content: text }
                    ]
                }, { headers: { 'Authorization': `Bearer ${currentKey}` }, timeout: 50000 });

                const aiMsg = response.data.choices[0].message.content;
                await ctx.reply(aiMsg);

                // Kirim script sebagai file
                const codeRegex = /```(\w*)\n([\s\S]*?)```/g;
                let match;
                while ((match = codeRegex.exec(aiMsg)) !== null) {
                    await ctx.replyWithDocument({
                        source: Buffer.from(match[2].trim(), 'utf-8'),
                        filename: `script_${Date.now()}.txt`
                    });
                }
                success = true;
            } catch (e) {
                if (e.response?.status === 401 || e.response?.status === 402) {
                    await redis.srem('apikeys:pool', currentKey);
                    attempt++;
                } else { break; }
            }
        }
        if (!success) ctx.reply("❌ Gagal merespon.");
    });

    if (req.method === 'POST') {
        await bot.handleUpdate(req.body);
        res.status(200).send('OK');
    } else {
        res.status(200).send('Running');
    }
};
