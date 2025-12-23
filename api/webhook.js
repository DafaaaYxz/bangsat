
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

    const getMainMenu = (userId) => {
        const buttons = [
            [Markup.button.callback('📊 Info Sistem', 'info_user'), Markup.button.callback('👤 Owner', 'view_owner')],
            [Markup.button.callback('🎟️ Upload Token VIP', 'upload_token')]
        ];
        if (isOwner(userId)) {
            buttons.unshift([Markup.button.callback('➕ API Key', 'setup_key'), Markup.button.callback('📜 List Keys', 'list_keys')]);
            buttons.push([Markup.button.callback('👥 List User VIP', 'list_user')]);
        }
        return Markup.inlineKeyboard(buttons);
    };

    bot.start((ctx) => {
        const msg = isOwner(ctx.from.id) ? "Halo Boss! Gunakan /adduser untuk buat VIP." : "Halo! Selamat datang di XdpzQ-AI.";
        ctx.replyWithMarkdown(msg, getMainMenu(ctx.from.id));
    });

    // --- OWNER COMMANDS ---
    bot.command('adduser', async (ctx) => {
        if (!isOwner(ctx.from.id)) return;
        await redis.set(`state:${ctx.from.id}`, 'vip_1');
        ctx.reply("🛠️ *Mode VIP*\n1. Masukkan Nama AI:");
    });

    bot.command('deluser', async (ctx) => {
        if (!isOwner(ctx.from.id)) return;
        const targetId = ctx.payload.trim();
        if (!targetId) return ctx.reply("Gunakan: /deluser <id_telegram>");
        await redis.del(`user_vip:${targetId}`);
        ctx.reply(`✅ VIP User ${targetId} telah dicabut.`);
    });

    // --- ACTIONS ---
    bot.action('list_user', async (ctx) => {
        if (!isOwner(ctx.from.id)) return ctx.answerCbQuery('Ditolak');
        ctx.answerCbQuery();
        
        const userKeys = await redis.keys('user_vip:*');
        if (userKeys.length === 0) return ctx.reply("Belum ada user VIP.");

        let txt = "👥 *DAFTAR USER VIP*\n\n";
        for (const key of userKeys) {
            const userId = key.split(':')[1];
            const tokenVip = await redis.get(key);
            const data = await redis.get(`vip_token:${tokenVip}`);
            const chatCount = await redis.get(`chat_count:${userId}`) || 0;
            
            txt += `👤 ID: \`${userId}\`\n🤖 AI: ${data?.aiName}\n👑 Own: ${data?.ownerName}\n📱 WA: ${data?.waNumber}\n💬 Total Chat: ${chatCount}\n🗑 /deluser ${userId}\n\n`;
        }
        ctx.replyWithMarkdown(txt);
    });

    bot.action('view_owner', async (ctx) => {
        let name = config.owner.name;
        let wa = config.owner.whatsapp;
        const vipToken = await redis.get(`user_vip:${ctx.from.id}`);
        if (vipToken) {
            const data = await redis.get(`vip_token:${vipToken}`);
            if (data) { name = data.ownerName; wa = data.waNumber; }
        }
        ctx.answerCbQuery();
        ctx.replyWithMarkdown(`👤 *OWNER INFO*\n\nNama: ${name}\nWA: ${wa}`, 
        Markup.inlineKeyboard([[Markup.button.url('WhatsApp', config.owner.waLink(wa))]]));
    });

    bot.action('setup_key', async (ctx) => {
        if (!isOwner(ctx.from.id)) return;
        await redis.set(`state:${ctx.from.id}`, 'awaiting_key');
        ctx.reply('Kirimkan API Key OpenRouter baru:');
    });

    bot.action('list_keys', async (ctx) => {
        if (!isOwner(ctx.from.id)) return;
        const keys = await redis.smembers('apikeys:pool');
        ctx.replyWithMarkdown(`📜 *LIST API KEY*\nTotal: ${keys.length}\n\nHapus dengan /delkey <nomor>`);
    });

    bot.action('upload_token', async (ctx) => {
        await redis.set(`state:${ctx.from.id}`, 'waiting_token');
        ctx.reply("🎟️ Silakan kirimkan Token VIP Anda:");
    });

    bot.action('info_user', async (ctx) => {
        const count = await redis.get(`chat_count:${ctx.from.id}`) || 0;
        const vip = await redis.get(`user_vip:${ctx.from.id}`);
        ctx.replyWithMarkdown(`📊 *INFO AKUN*\n\n🆔 ID: \`${ctx.from.id}\` \n🌟 Status: ${vip ? 'VIP' : 'Standar'}\n💬 Total Chat: ${count}`);
    });

    // --- MESSAGE HANDLER ---
    bot.on('text', async (ctx) => {
        const userId = ctx.from.id;
        const text = ctx.message.text;
        const state = await redis.get(`state:${userId}`);

        // Logic Create VIP (Owner)
        if (state === 'vip_1' && isOwner(userId)) {
            await redis.set(`temp_vip:${userId}`, JSON.stringify({ aiName: text }));
            await redis.set(`state:${userId}`, 'vip_2');
            return ctx.reply("2. Masukkan Nama Owner:");
        }
        if (state === 'vip_2' && isOwner(userId)) {
            const temp = await redis.get(`temp_vip:${userId}`);
            await redis.set(`temp_vip:${userId}`, JSON.stringify({ ...temp, ownerName: text }));
            await redis.set(`state:${userId}`, 'vip_3');
            return ctx.reply("3. Masukkan Nomor WhatsApp (contoh: 0857...):");
        }
        if (state === 'vip_3' && isOwner(userId)) {
            const temp = JSON.parse(await redis.get(`temp_vip:${userId}`));
            const tokenVIP = crypto.randomBytes(3).toString('hex').toUpperCase();
            await redis.set(`vip_token:${tokenVIP}`, { ...temp, waNumber: text });
            await redis.del(`state:${userId}`);
            await redis.del(`temp_vip:${userId}`);
            return ctx.replyWithMarkdown(`✅ *TOKEN VIP: \`${tokenVIP}\`*\nAI: ${temp.aiName}\nOwner: ${temp.ownerName}\nWA: ${text}`);
        }

        // Logic Upload Token
        if (state === 'waiting_token') {
            const data = await redis.get(`vip_token:${text.toUpperCase()}`);
            if (!data) return ctx.reply("❌ Token Salah!");
            await redis.set(`user_vip:${userId}`, text.toUpperCase());
            await redis.del(`state:${userId}`);
            return ctx.reply(`✅ VIP AKTIF!`);
        }

        // Logic API Key
        if (state === 'awaiting_key' && isOwner(userId)) {
            await redis.sadd('apikeys:pool', text.trim());
            await redis.del(`state:${userId}`);
            return ctx.reply("✅ Key ditambahkan!");
        }

        if (text.startsWith('/')) return;

        // --- CHAT AI ---
        const keys = await redis.smembers('apikeys:pool');
        if (keys.length === 0) return ctx.reply("⚠️ API Key Kosong.");

        let aiName = config.botName;
        let ownerName = config.defaultOwnerName;
        const userVip = await redis.get(`user_vip:${userId}`);
        if (userVip) {
            const d = await redis.get(`vip_token:${userVip}`);
            if (d) { aiName = d.aiName; ownerName = d.ownerName; }
        }

        await ctx.sendChatAction('typing');
        await redis.incr(`chat_count:${userId}`); // Hitung statistik chat

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
        if (!success) ctx.reply("❌ Gangguan Sistem.");
    });

    if (req.method === 'POST') {
        await bot.handleUpdate(req.body);
        res.status(200).send('OK');
    } else {
        res.status(200).send('Running');
    }
};
