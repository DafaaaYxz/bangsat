
const { Telegraf } = require('telegraf');
const axios = require('axios');

module.exports = async (req, res) => {
    const token = process.env.BOT_TOKEN;
    const ownerId = process.env.OWNER_ID; // Ambil ID Owner dari Env
    const defaultAiKey = "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";

    if (!token) return res.status(200).send('Token missing');

    const bot = new Telegraf(token);

    // Fitur /start
    bot.start((ctx) => {
        ctx.reply('Bot AI DeepSeek Aktif!\n\nKirim pesan teks untuk mulai chat.\nKhusus VIP/Owner dapat menggunakan fitur premium.');
    });

    // Fitur /info
    bot.command('info', (ctx) => {
        const isOwner = ctx.from.id.toString() === ownerId;
        ctx.reply(`👤 Info User:\nID: ${ctx.from.id}\nStatus: ${isOwner ? 'Owner / VIP' : 'User Biasa'}`);
    });

    // Fitur AI Chat (DeepSeek v3.1)
    bot.on('text', async (ctx) => {
        const userId = ctx.from.id.toString();
        const isVIP = userId === ownerId; // Sementara VIP adalah Owner

        // Jika bukan VIP, beri batasan (Opsional)
        if (!isVIP) {
            return ctx.reply("Maaf, fitur AI Chat ini hanya untuk user VIP / Owner.");
        }

        const userMessage = ctx.message.text;
        
        // Tampilkan status "typing" agar user tahu bot sedang berpikir
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
                        'Content-Type': 'application/json'
                    }
                }
            );

            const aiResponse = response.data.choices[0].message.content;
            await ctx.reply(aiResponse);

        } catch (error) {
            console.error('AI Error:', error.response?.data || error.message);
            ctx.reply('Maaf, server AI sedang sibuk atau API Key bermasalah.');
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
