
const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const { Redis } = require('@upstash/redis');
const config = require('./config'); // Mengambil data persona dari config.js

const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

module.exports = async (req, res) => {
    const token = process.env.BOT_TOKEN;
    if (!token) return res.status(200).send('Bot Token missing');
    const bot = new Telegraf(token);

    // --- MENU BUTTON UTAMA ---
    const mainMenu = Markup.inlineKeyboard([
        [Markup.button.callback('🔑 Set API Key', 'setup_key'), Markup.button.callback('📊 Info Akun', 'info_user')],
        [Markup.button.callback('👤 Owner', 'view_owner'), Markup.button.callback('💬 Mulai Chat', 'start_chat')]
    ]);

    // 1. Command Start
    bot.start((ctx) => {
        ctx.replyWithMarkdown(config.messages.welcome, mainMenu);
    });

    // 2. Action Handler (Tombol diklik)
    bot.action('setup_key', async (ctx) => {
        await redis.set(`state:${ctx.from.id}`, 'awaiting_key', { ex: 300 });
        ctx.answerCbQuery();
        ctx.reply('Silakan kirimkan API Key OpenRouter Anda:');
    });

    bot.action('info_user', async (ctx) => {
        const userKey = await redis.get(`apikey:${ctx.from.id}`);
        const status = userKey ? "✅ Tersimpan" : "❌ Belum ada";
        ctx.answerCbQuery();
        ctx.replyWithMarkdown(config.messages.info(status, ctx.from.id), mainMenu);
    });

    bot.action('view_owner', (ctx) => {
        ctx.answerCbQuery();
        ctx.replyWithMarkdown(`👤 *OWNER INFO*\n\nNama: ${config.owner.name}\nWhatsApp: ${config.owner.whatsapp}`, 
        Markup.inlineKeyboard([
            [Markup.button.url('Hubungi via WhatsApp', config.owner.waLink)]
        ]));
    });

    bot.action('start_chat', (ctx) => {
        ctx.answerCbQuery();
        ctx.reply('Silakan langsung ketik pesan apa saja, saya akan menjawab!');
    });

    // 3. Command Manual
    bot.command('owner', (ctx) => ctx.replyWithMarkdown(`Nama: ${config.owner.name}\nWA: ${config.owner.whatsapp}`));

    // 4. Handler Pesan
    bot.on('text', async (ctx) => {
        const userId = ctx.from.id;
        const text = ctx.message.text;

        const state = await redis.get(`state:${userId}`);
        if (state === 'awaiting_key') {
            const cleanKey = text.trim();
            if (!cleanKey.startsWith('sk-or-')) return ctx.reply('❌ Key tidak valid!');
            await redis.set(`apikey:${userId}`, cleanKey);
            await redis.del(`state:${userId}`);
            return ctx.reply('✅ Berhasil! Sekarang kamu bisa chat AI.', mainMenu);
        }

        if (text.startsWith('/')) return;

        const userApiKey = await redis.get(`apikey:${userId}`);
        if (!userApiKey) return ctx.reply('⚠️ Kamu belum punya API Key.', mainMenu);

        await ctx.sendChatAction('typing');

        try {
            const response = await axios.post(
                'https://openrouter.ai/api/v1/chat/completions',
                {
                    model: 'deepseek/deepseek-chat',
                    messages: [
                        { role: 'system', content: config.persona }, // Memasukkan Persona
                        { role: 'user', content: text }
                    ]
                },
                {
                    headers: { 'Authorization': `Bearer ${userApiKey}`, 'Content-Type': 'application/json' },
                    timeout: 50000
                }
            );

            const aiResponse = response.data.choices?.[0]?.message?.content;
            await ctx.reply(aiResponse || "☁️ AI tidak merespon.");

        } catch (error) {
            ctx.reply('❌ Error: Gagal menghubungi AI. Cek saldo Key Anda.');
        }
    });

    if (req.method === 'POST') {
        await bot.handleUpdate(req.body);
        res.status(200).send('OK');
    } else {
        res.status(200).send('Bot Running');
    }
};
