
const { Telegraf } = require('telegraf');
const axios = require('axios');
const { Redis } = require('@upstash/redis');

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

module.exports = async (req, res) => {
    const token = process.env.BOT_TOKEN;
    if (!token) return res.status(200).send('Token missing');
    
    const bot = new Telegraf(token);

    bot.start((ctx) => ctx.reply('Bot Gemini Aktif!\n/upkey - Set API Key\n/info - Cek Status'));

    bot.command('upkey', async (ctx) => {
        await redis.set(`state:${ctx.from.id}`, 'awaiting_key', { ex: 300 });
        ctx.reply('Silakan kirim API Key Gemini Anda dari Google AI Studio:');
    });

    bot.on('text', async (ctx) => {
        const userId = ctx.from.id;
        const text = ctx.message.text;

        // 1. Logika simpan API Key
        const state = await redis.get(`state:${userId}`);
        if (state === 'awaiting_key') {
            const cleanKey = text.trim(); // Bersihkan spasi/enter
            await redis.set(`apikey:${userId}`, cleanKey);
            await redis.del(`state:${userId}`);
            return ctx.reply('✅ API Key berhasil disimpan! Silakan chat sekarang.');
        }

        // 2. Ambil API Key
        const userApiKey = await redis.get(`apikey:${userId}`);
        if (!userApiKey) return ctx.reply('⚠️ Klik /upkey dulu bos.');

        if (text.startsWith('/')) return;

        await ctx.sendChatAction('typing');

        try {
            // Gunakan model gemini-1.5-flash (lebih stabil & gratis)
            const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${userApiKey}`;
            
            const response = await axios.post(geminiUrl, {
                contents: [{ parts: [{ text: text }] }],
                // Tambahkan ini agar AI tidak terlalu sensitif (opsional)
                safetySettings: [
                    { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
                    { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" }
                ]
            }, {
                headers: { 'Content-Type': 'application/json' },
                timeout: 20000 
            });

            // Cek apakah ada jawaban dari AI
            const candidate = response.data.candidates?.[0];
            
            if (candidate && candidate.content) {
                const aiText = candidate.content.parts[0].text;
                await ctx.reply(aiText);
            } else {
                // Biasanya kena sensor Google
                ctx.reply('☁️ AI tidak bisa menjawab pesan ini karena kebijakan keamanan Google.');
            }

        } catch (error) {
            console.error('ERROR DETAIL:', error.response?.data || error.message);
            
            const errData = error.response?.data?.error;
            if (errData?.status === "UNAUTHENTICATED") {
                ctx.reply('❌ API KEY SALAH. Silakan /upkey ulang dengan key yang benar.');
            } else if (errData?.status === "RESOURCE_EXHAUSTED") {
                ctx.reply('❌ Kuota API Key habis (Limit tercapai).');
            } else {
                ctx.reply(`❌ Error: ${errData?.message || 'Terjadi masalah koneksi ke Google.'}`);
            }
        }
    });

    if (req.method === 'POST') {
        await bot.handleUpdate(req.body);
        res.status(200).send('OK');
    } else {
        res.status(200).send('Running');
    }
};
