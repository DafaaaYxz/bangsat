
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
        ctx.reply('Silakan kirim API Key Gemini Anda:');
    });

    bot.on('text', async (ctx) => {
        const userId = ctx.from.id;
        const text = ctx.message.text;

        const state = await redis.get(`state:${userId}`);
        if (state === 'awaiting_key') {
            const cleanKey = text.trim();
            await redis.set(`apikey:${userId}`, cleanKey);
            await redis.del(`state:${userId}`);
            return ctx.reply('✅ API Key berhasil disimpan!');
        }

        const userApiKey = await redis.get(`apikey:${userId}`);
        if (!userApiKey) return ctx.reply('⚠️ Klik /upkey dulu.');
        if (text.startsWith('/')) return;

        await ctx.sendChatAction('typing');

        try {
            // PERUBAHAN DISINI: Menggunakan v1 (bukan v1beta) dan model gemini-1.5-flash
            const geminiUrl = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${userApiKey}`;
            
            const response = await axios.post(geminiUrl, {
                contents: [{
                    parts: [{ text: text }]
                }]
            }, {
                headers: { 'Content-Type': 'application/json' }
            });

            // Ambil jawaban
            if (response.data.candidates && response.data.candidates[0].content) {
                const aiText = response.data.candidates[0].content.parts[0].text;
                await ctx.reply(aiText);
            } else {
                ctx.reply('☁️ Gemini tidak memberikan jawaban (mungkin karena filter keamanan).');
            }

        } catch (error) {
            console.error('ERROR:', error.response?.data || error.message);
            
            const errStatus = error.response?.data?.error?.status;
            const errMsg = error.response?.data?.error?.message;

            if (errStatus === "INVALID_ARGUMENT") {
                ctx.reply(`❌ Format salah atau model tidak didukung. Pesan: ${errMsg}`);
            } else if (errStatus === "UNAUTHENTICATED") {
                ctx.reply('❌ API Key salah. Silakan /upkey ulang.');
            } else {
                ctx.reply(`❌ Google API Error: ${errMsg || 'Koneksi terputus'}`);
            }
        }
    });

    if (req.method === 'POST') {
        await bot.handleUpdate(req.body);
        res.status(200).send('OK');
    } else {
        res.status(200).send('Bot Running');
    }
};
