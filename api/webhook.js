
const { Telegraf } = require('telegraf');
const axios = require('axios');
const { Redis } = require('@upstash/redis');

// Inisialisasi Database Redis (Untuk simpan API Key)
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

module.exports = async (req, res) => {
    const token = process.env.BOT_TOKEN;
    const ownerId = process.env.OWNER_ID;

    if (!token) return res.status(200).send('Token missing');
    const bot = new Telegraf(token);

    // 1. Fitur /start
    bot.start((ctx) => {
        ctx.reply('Selamat datang di Bot Gemini AI!\n\nPerintah:\n/upkey - Untuk mendaftarkan API Key Gemini\n/info - Cek status akun');
    });

    // 2. Fitur /upkey (Proses pendaftaran Key)
    bot.command('upkey', async (ctx) => {
        // Simpan status bahwa user ini sedang ingin menginput key
        await redis.set(`state:${ctx.from.id}`, 'awaiting_key', { ex: 300 }); // Expire 5 menit
        ctx.reply('Silakan kirim API Key Gemini AI Studio Anda:');
    });

    // 3. Fitur /info
    bot.command('info', async (ctx) => {
        const userKey = await redis.get(`apikey:${ctx.from.id}`);
        const status = userKey ? "✅ Aktif (Sudah ada Key)" : "❌ Belum Aktif (Gunakan /upkey)";
        ctx.reply(`📌 *INFO USER*\nID: \`${ctx.from.id}\`\nStatus: ${status}`, { parse_mode: 'Markdown' });
    });

    // 4. Handler Pesan (Input Key atau Chat AI)
    bot.on('text', async (ctx) => {
        const userId = ctx.from.id;
        const text = ctx.message.text;

        // Cek apakah user sedang dalam proses input key
        const state = await redis.get(`state:${userId}`);

        if (state === 'awaiting_key') {
            // Simpan API Key ke database secara permanen
            await redis.set(`apikey:${userId}`, text);
            await redis.del(`state:${userId}`); // Hapus state
            return ctx.reply('✅ API Key berhasil disimpan! Sekarang kamu bisa chat langsung dengan bot.');
        }

        // --- PROSES CHAT AI GEMINI ---
        const userApiKey = await redis.get(`apikey:${userId}`);

        if (!userApiKey) {
            return ctx.reply('⚠️ Kamu belum punya API Key. Silakan ketik /upkey terlebih dahulu.');
        }

        await ctx.sendChatAction('typing');

        try {
            // URL Google Gemini AI Studio
            const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${userApiKey}`;
            
            const response = await axios.post(geminiUrl, {
                contents: [{ parts: [{ text: text }] }]
            });

            const aiText = response.data.candidates[0].content.parts[0].text;
            ctx.reply(aiText);

        } catch (error) {
            console.error('Gemini Error:', error.response?.data || error.message);
            const errorMsg = error.response?.data?.error?.message || "";
            if (errorMsg.includes('API_KEY_INVALID')) {
                ctx.reply('❌ API Key tidak valid. Silakan /upkey ulang.');
            } else {
                ctx.reply('❌ Terjadi kesalahan pada server Gemini. Coba lagi nanti.');
            }
        }
    });

    try {
        if (req.method === 'POST') {
            await bot.handleUpdate(req.body);
            res.status(200).send('OK');
        } else {
            res.status(200).send('Bot is running...');
        }
    } catch (err) {
        res.status(200).send('Error');
    }
};
