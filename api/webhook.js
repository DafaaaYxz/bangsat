
const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const { Redis } = require('@upstash/redis');
const config = require('./config');

const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

module.exports = async (req, res) => {
    const token = process.env.BOT_TOKEN;
    if (!token) return res.status(200).send('Bot Token missing');
    const bot = new Telegraf(token);

    // Filter Owner
    const isOwner = (id) => id.toString() === config.ownerId;

    // --- MENU BUTTONS ---
    const getMenu = (userId) => {
        const buttons = [
            [Markup.button.callback('📊 Info Sistem', 'info_user')],
            [Markup.button.callback('👤 Owner', 'view_owner')]
        ];
        // Jika owner, tambahkan tombol Set API Key
        if (isOwner(userId)) {
            buttons.unshift([Markup.button.callback('⚙️ Set API Key Global', 'setup_key')]);
        }
        return Markup.inlineKeyboard(buttons);
    };

    bot.start((ctx) => {
        const msg = isOwner(ctx.from.id) ? config.messages.welcomeOwner : config.messages.welcome;
        ctx.replyWithMarkdown(msg, getMenu(ctx.from.id));
    });

    // Action: Set Key (Hanya Owner)
    bot.action('setup_key', async (ctx) => {
        if (!isOwner(ctx.from.id)) return ctx.answerCbQuery('Akses Ditolak!');
        await redis.set(`state:${ctx.from.id}`, 'awaiting_global_key', { ex: 300 });
        ctx.answerCbQuery();
        ctx.reply('Boss, silakan kirim API Key OpenRouter baru untuk SEMUA USER:');
    });

    bot.action('info_user', async (ctx) => {
        const globalKey = await redis.get('apikey:global');
        const status = globalKey ? "✅ AKTIF" : "❌ MATI (Owner belum set key)";
        ctx.answerCbQuery();
        ctx.replyWithMarkdown(config.messages.info(status, ctx.from.id), getMenu(ctx.from.id));
    });

    bot.action('view_owner', (ctx) => {
        ctx.answerCbQuery();
        ctx.replyWithMarkdown(`👤 *OWNER INFO*\n\nNama: ${config.owner.name}\nWhatsApp: ${config.owner.whatsapp}`, 
        Markup.inlineKeyboard([[Markup.button.url('Hubungi via WhatsApp', config.owner.waLink)]]));
    });

    // --- HANDLER PESAN ---
    bot.on('text', async (ctx) => {
        const userId = ctx.from.id;
        const text = ctx.message.text;

        // 1. Logika Update Key Global (Hanya Owner)
        const state = await redis.get(`state:${userId}`);
        if (state === 'awaiting_global_key' && isOwner(userId)) {
            if (!text.startsWith('sk-or-')) return ctx.reply('❌ Key tidak valid, Boss!');
            await redis.set('apikey:global', text.trim());
            await redis.del(`state:${userId}`);
            return ctx.reply('✅ MANTAP! API Key Global berhasil diperbarui. Semua user sekarang bisa pakai.', getMenu(userId));
        }

        if (text.startsWith('/')) return;

        // 2. Ambil Key Global untuk Semua User
        const globalApiKey = await redis.get('apikey:global');
        if (!globalApiKey) {
            return ctx.reply('⚠️ Maaf, Bot sedang maintenance (API Key belum diatur oleh owner). Silakan hubungi /owner.');
        }

        await ctx.sendChatAction('typing');

        try {
            const response = await axios.post(
                'https://openrouter.ai/api/v1/chat/completions',
                {
                    model: 'deepseek/deepseek-chat',
                    messages: [
                        { role: 'system', content: config.persona },
                        { role: 'user', content: text }
                    ]
                },
                { headers: { 'Authorization': `Bearer ${globalApiKey}` }, timeout: 60000 }
            );

            const aiResponse = response.data.choices?.[0]?.message?.content;
            if (!aiResponse) return ctx.reply("☁️ AI sedang sibuk.");

            // KIRIM TEKS ASLI
            await ctx.reply(aiResponse);

            // LOGIKA KIRIM SCRIPT SEBAGAI FILE
            const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
            let match;
            while ((match = codeBlockRegex.exec(aiResponse)) !== null) {
                const language = match[1] || 'txt';
                const codeContent = match[2].trim();
                const filename = `script_${Math.floor(Date.now() / 1000)}.${getExt(language)}`;

                await ctx.replyWithDocument({
                    source: Buffer.from(codeContent, 'utf-8'),
                    filename: filename
                }, { caption: `📄 Script ${language.toUpperCase()}` });
            }

        } catch (error) {
            console.error('API Error:', error.response?.data || error.message);
            ctx.reply('❌ Gagal memproses permintaan. Mungkin kuota API Owner habis.');
        }
    });

    function getExt(lang) {
        const extMap = { 'js': 'js', 'javascript': 'js', 'py': 'py', 'python': 'py', 'html': 'html', 'css': 'css', 'php': 'php' };
        return extMap[lang.toLowerCase()] || 'txt';
    }

    if (req.method === 'POST') {
        await bot.handleUpdate(req.body);
        res.status(200).send('OK');
    } else {
        res.status(200).send('Bot Running');
    }
};
