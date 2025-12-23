
const { Telegraf } = require('telegraf');
const axios = require('axios');
const { Redis } = require('@upstash/redis');

// Inisialisasi Database Redis (Ingatan Bot)
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

module.exports = async (req, res) => {
    const token = process.env.BOT_TOKEN;
    if (!token) return res.status(200).send('Bot Token missing');
    const bot = new Telegraf(token);

    bot.start((ctx) => {
        ctx.reply('Halo! Saya Bot AI DeepSeek.\n\nPerintah:\n/upkey - Masukkan API Key OpenRouter\n/info - Cek status Key Anda\n\nKirim pesan teks untuk mulai chat.');
    });

    bot.command('upkey', async (ctx) => {
        await redis.set(`state:${ctx.from.id}`, 'awaiting_key', { ex: 300 });
        ctx.reply('Silakan kirim API Key OpenRouter Anda (sk-or-v1-...):');
    });

    bot.command('info', async (ctx) => {
        const userKey = await redis.get(`apikey:${ctx.from.id}`);
        const status = userKey ? "✅ Tersimpan" : "❌ Belum ada Key";
        ctx.reply(`👤 *Status User*\nID: \`${ctx.from.id}\` \nAPI Key: ${status}`, { parse_mode: 'Markdown' });
    });

    bot.on('text', async (ctx) => {
        const userId = ctx.from.id;
        const text = ctx.message.text;

        // 1. Cek State (Apakah sedang input key?)
        const state = await redis.get(`state:${userId}`);
        if (state === 'awaiting_key') {
            const cleanKey = text.trim();
            if (!cleanKey.startsWith('sk-or-')) {
                return ctx.reply('❌ Format salah! Key OpenRouter biasanya diawali "sk-or-v1-". Coba /upkey lagi.');
            }
            await redis.set(`apikey:${userId}`, cleanKey);
            await redis.del(`state:${userId}`);
            return ctx.reply('✅ API Key DeepSeek Berhasil Disimpan! Silakan mulai chat.');
        }

        if (text.startsWith('/')) return;

        // 2. Ambil API Key User dari Redis
        const userApiKey = await redis.get(`apikey:${userId}`);
        if (!userApiKey) {
            return ctx.reply('⚠️ Kamu belum memasukkan API Key.\nKetik /upkey untuk memulai.');
        }

        await ctx.sendChatAction('typing');

        try {
            // Request ke OpenRouter (DeepSeek)
            const response = await axios.post(
                'https://openrouter.ai/api/v1/chat/completions',
                {
                    model: 'deepseek/deepseek-chat', // Atau 'nex-agi/deepseek-v3.1-nex-n1:free'
                    messages: [{ role: 'user', content: text }]
                },
                {
                    headers: {
                        'Authorization': `Bearer ${userApiKey}`,
                        'Content-Type': 'application/json',
                        'HTTP-Referer': 'https://vercel.com', // Syarat OpenRouter
                    },
                    timeout: 40000 // DeepSeek kadang lambat, beri waktu lebih
                }
            );

            const aiResponse = response.data.choices?.[0]?.message?.content;
            if (aiResponse) {
                await ctx.reply(aiResponse);
            } else {
                ctx.reply('☁️ DeepSeek tidak memberikan respon. Coba lagi.');
            }

        } catch (error) {
            console.error('DEEPSEEK ERROR:', error.response?.data || error.message);
            const errStatus = error.response?.status;
            
            if (errStatus === 401) {
                ctx.reply('❌ API Key salah atau sudah kadaluarsa. Silakan /upkey ulang.');
            } else if (errStatus === 402) {
                ctx.reply('❌ Saldo OpenRouter Anda habis.');
            } else {
                ctx.reply('❌ Terjadi gangguan pada koneksi DeepSeek/OpenRouter.');
            }
        }
    });

    try {
        if (req.method === 'POST') {
            await bot.handleUpdate(req.body);
            res.status(200).send('OK');
        } else {
            res.status(200).send('Bot is running');
        }
    } catch (err) {
        res.status(200).send('Error');
    }
};
