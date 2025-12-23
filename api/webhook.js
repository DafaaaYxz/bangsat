
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

    const mainMenu = Markup.inlineKeyboard([
        [Markup.button.callback('🔑 Set API Key', 'setup_key'), Markup.button.callback('📊 Info Akun', 'info_user')],
        [Markup.button.callback('👤 Owner', 'view_owner')]
    ]);

    bot.start((ctx) => ctx.replyWithMarkdown(config.messages.welcome, mainMenu));

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
        Markup.inlineKeyboard([[Markup.button.url('Hubungi via WhatsApp', config.owner.waLink)]]));
    });

    bot.on('text', async (ctx) => {
        const userId = ctx.from.id;
        const text = ctx.message.text;

        // Handler Input API Key
        const state = await redis.get(`state:${userId}`);
        if (state === 'awaiting_key') {
            if (!text.startsWith('sk-or-')) return ctx.reply('❌ Key tidak valid!');
            await redis.set(`apikey:${userId}`, text.trim());
            await redis.del(`state:${userId}`);
            return ctx.reply('✅ API Key disimpan! Silakan tanya apa saja.', mainMenu);
        }

        if (text.startsWith('/')) return;

        // Cek API Key
        const userApiKey = await redis.get(`apikey:${userId}`);
        if (!userApiKey) return ctx.reply('⚠️ Klik /upkey dulu bos.', mainMenu);

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
                { headers: { 'Authorization': `Bearer ${userApiKey}` }, timeout: 50000 }
            );

            const aiResponse = response.data.choices?.[0]?.message?.content;
            if (!aiResponse) return ctx.reply("☁️ AI tidak merespon.");

            // --- LOGIKA DETEKSI SCRIPT/KODE ---
            // Regex untuk mencari blok kode ```language ... ```
            const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
            let match;
            let foundCode = false;

            // Kita kirim pesan teks aslinya dulu
            await ctx.reply(aiResponse);

            // Cari semua blok kode dan kirim sebagai file
            while ((match = codeBlockRegex.exec(aiResponse)) !== null) {
                foundCode = true;
                const language = match[1] || 'txt'; // default ke txt jika bahasa tidak disebut
                const codeContent = match[2].trim();
                
                // Buat nama file unik
                const filename = `script_${userId}_${Math.floor(Date.now() / 1000)}.${getExt(language)}`;

                // Kirim file menggunakan Buffer (Tanpa simpan di disk)
                await ctx.replyWithDocument({
                    source: Buffer.from(codeContent, 'utf-8'),
                    filename: filename
                }, {
                    caption: `📄 File script (${language}) berhasil dibuat.`
                });
            }

        } catch (error) {
            console.error(error);
            ctx.reply('❌ Gagal menghubungi AI. Pastikan saldo Key Anda mencukupi.');
        }
    });

    // Helper untuk menentukan ekstensi file
    function getExt(lang) {
        const extMap = {
            'javascript': 'js', 'js': 'js', 'python': 'py', 'py': 'py',
            'html': 'html', 'css': 'css', 'php': 'php', 'java': 'java',
            'cpp': 'cpp', 'c': 'c', 'json': 'json', 'typescript': 'ts', 'ts': 'ts'
        };
        return extMap[lang.toLowerCase()] || 'txt';
    }

    if (req.method === 'POST') {
        await bot.handleUpdate(req.body);
        res.status(200).send('OK');
    } else {
        res.status(200).send('Bot Running');
    }
};
