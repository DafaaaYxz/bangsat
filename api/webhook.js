
const { Telegraf } = require('telegraf');
const axios = require('axios');

module.exports = async (req, res) => {
    const token = process.env.BOT_TOKEN;
    const ownerId = process.env.OWNER_ID; // ID Owner Utama
    const vipIds = process.env.VIP_IDS ? process.env.VIP_IDS.split(',') : []; // List ID VIP (koma)
    
    // API Key Default dari Anda
    const defaultAiKey = "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";

    if (!token) return res.status(200).send('Token missing');

    const bot = new Telegraf(token);

    // Fitur /start
    bot.start((ctx) => {
        ctx.reply('Halo! Bot AI DeepSeek sudah aktif untuk SEMUA USER.\n\nKirim pesan teks apa saja, saya akan menjawab menggunakan AI.');
    });

    // Fitur /ping
    bot.command('ping', (ctx) => ctx.reply('pong!'));

    // Fitur /info (Cek Status)
    bot.command('info', (ctx) => {
        const userId = ctx.from.id.toString();
        let status = 'User Biasa';
        
        if (userId === ownerId) {
            status = '👑 Owner (Full Access)';
        } else if (vipIds.includes(userId)) {
            status = '🌟 VIP Member';
        }

        ctx.reply(`📌 *INFO USER*\n\n👤 Nama: ${ctx.from.first_name}\n🆔 ID: \`${userId}\` \n📊 Status: ${status}`, { parse_mode: 'Markdown' });
    });

    // Fitur AI Chat (Terbuka untuk Umum)
    bot.on('text', async (ctx) => {
        const userMessage = ctx.message.text;
        
        // Abaikan jika pesan adalah command (diawali /)
        if (userMessage.startsWith('/')) return;

        await ctx.sendChatAction('typing');

        try {
            const response = await axios.post(
                'https://openrouter.ai/api/v1/chat/completions',
                {
                    model: 'nex-agi/deepseek-v3.1-nex-n1:free',
                    messages: [{ role: 'user', content: userMessage }]
                },
                {
                    headers: {
                        'Authorization': `Bearer ${defaultAiKey}`,
                        'Content-Type': 'application/json',
                        'HTTP-Referer': 'https://vercel.com', // Opsional untuk OpenRouter
                    },
                    timeout: 25000 // Set timeout 25 detik (Vercel hobby plan max 10-60s)
                }
            );

            const aiResponse = response.data.choices[0]?.message?.content || "Maaf, AI tidak memberikan respon.";
            await ctx.reply(aiResponse);

        } catch (error) {
            console.error('AI Error:', error.response?.data || error.message);
            
            if (error.response?.status === 401) {
                ctx.reply('⚠️ Error: API Key AI tidak valid atau sudah expired.');
            } else {
                ctx.reply('❌ Maaf, layanan AI sedang gangguan. Silakan coba lagi nanti.');
            }
        }
    });

    try {
        if (req.method === 'POST') {
            await bot.handleUpdate(req.body);
            res.status(200).send('OK');
        } else {
            res.status(200).send('Bot berjalan normal...');
        }
    } catch (err) {
        console.error('Webhook Error:', err);
        res.status(200).send('Error');
    }
};
