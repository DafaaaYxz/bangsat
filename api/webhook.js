
const { Telegraf } = require('telegraf');
const axios = require('axios');
const { Redis } = require('@upstash/redis');

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

module.exports = async (req, res) => {
    const token = process.env.BOT_TOKEN;
    if (!token) return res.status(200).send('Bot Token missing');
    const bot = new Telegraf(token);

    // 1. Fitur /start
    bot.start((ctx) => {
        ctx.reply('Halo! Saya Bot AI DeepSeek.\n\nPerintah:\n/upkey - Masukkan API Key OpenRouter\n/info - Cek status Key Anda\n/owner - Info Kontak Pemilik Bot\n\nKirim pesan teks untuk mulai chat.');
    });

    // 2. Fitur /owner (Update Terbaru)
    bot.command('owner', (ctx) => {
        const ownerMsg = `
👤 *OWNER INFORMATION*
        
📌 *Nama:* XdpzQ
📱 *WhatsApp:* [085736486023](https://wa.me/6285736486023)
💬 *Status:* Online (Sedia Bantuan)

Silakan hubungi WhatsApp di atas jika Anda memiliki kendala atau pertanyaan seputar bot.
        `;
        ctx.replyWithMarkdown(ownerMsg, { disable_web_page_preview: false });
    });

    // 3. Fitur /upkey
    bot.command('upkey', async (ctx) => {
        await redis.set(`state:${ctx.from.id}`, 'awaiting_key', { ex: 300 });
        ctx.reply('Silakan kirim API Key OpenRouter Anda (sk-or-v1-...):');
    });

    // 4. Fitur /info
    bot.command('info', async (ctx) => {
        const userKey = await redis.get(`apikey:${ctx.from.id}`);
        const status = userKey ? "✅ Tersimpan" : "❌ Belum ada Key";
        ctx.reply(`👤 *Status User*\nID: \`${ctx.from.id}\` \nAPI Key: ${status}`, { parse_mode: 'Markdown' });
    });

    // 5. Handler Chat AI
    bot.on('text', async (ctx) => {
        const userId = ctx.from.id;
        const text = ctx.message.text;

        const state = await redis.get(`state:${userId}`);
        if (state === 'awaiting_key') {
            const cleanKey = text.trim();
            if (!cleanKey.startsWith('sk-or-')) {
                return ctx.reply('❌ Format salah! Gunakan Key OpenRouter yang benar.');
            }
            await redis.set(`apikey:${userId}`, cleanKey);
            await redis.del(`state:${userId}`);
            return ctx.reply('✅ API Key Berhasil Disimpan!');
        }

        if (text.startsWith('/')) return;

        const userApiKey = await redis.get(`apikey:${userId}`);
        if (!userApiKey) return ctx.reply('⚠️ Klik /upkey dulu untuk memasukkan API Key.');

        await ctx.sendChatAction('typing');

        try {
            const response = await axios.post(
                'https://openrouter.ai/api/v1/chat/completions',
                {
                    model: 'deepseek/deepseek-chat',
                    messages: [{ role: 'user', content: text }]
                },
                {
                    headers: {
                        'Authorization': `Bearer ${userApiKey}`,
                        'Content-Type': 'application/json',
                        'HTTP-Referer': 'https://vercel.com',
                    },
                    timeout: 40000
                }
            );

            const aiResponse = response.data.choices?.[0]?.message?.content;
            await ctx.reply(aiResponse || "☁️ AI tidak merespon.");

        } catch (error) {
            console.error('ERROR:', error.response?.data || error.message);
            ctx.reply('❌ Gagal menghubungi AI. Pastikan saldo Key Anda mencukupi.');
        }
    });

    if (req.method === 'POST') {
        await bot.handleUpdate(req.body);
        res.status(200).send('OK');
    } else {
        res.status(200).send('Bot is running');
    }
};
