
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

    const isOwner = (id) => id.toString() === config.ownerId;

    // --- MENU BUTTONS ---
    const getMenu = (userId) => {
        const buttons = [
            [Markup.button.callback('📊 Info Sistem', 'info_user')],
            [Markup.button.callback('👤 Owner', 'view_owner')]
        ];
        if (isOwner(userId)) {
            buttons.unshift([Markup.button.callback('➕ Tambah Key', 'setup_key'), Markup.button.callback('📜 List Keys', 'list_keys')]);
        }
        return Markup.inlineKeyboard(buttons);
    };

    bot.start((ctx) => {
        const msg = isOwner(ctx.from.id) ? config.messages.welcomeOwner : config.messages.welcome;
        ctx.replyWithMarkdown(msg, getMenu(ctx.from.id));
    });

    // Action: Add Key
    bot.action('setup_key', async (ctx) => {
        if (!isOwner(ctx.from.id)) return ctx.answerCbQuery('Akses Ditolak!');
        await redis.set(`state:${ctx.from.id}`, 'awaiting_key', { ex: 300 });
        ctx.answerCbQuery();
        ctx.reply('Boss, kirim API Key OpenRouter baru untuk dimasukkan ke POOL:');
    });

    // Action: List Keys
    bot.action('list_keys', async (ctx) => {
        if (!isOwner(ctx.from.id)) return ctx.answerCbQuery('Akses Ditolak!');
        const keys = await redis.smembers('apikeys:pool');
        ctx.answerCbQuery();
        if (keys.length === 0) return ctx.reply('Database kosong, Boss.');
        
        let listMsg = "📜 *DAFTAR API KEY ANDA:*\n\n";
        keys.forEach((k, i) => {
            listMsg += `${i + 1}. \`${k.substring(0, 15)}...\`\n`;
        });
        listMsg += "\n_Gunakan /delkey <nomor> untuk menghapus_";
        ctx.replyWithMarkdown(listMsg, getMenu(ctx.from.id));
    });

    bot.action('info_user', async (ctx) => {
        const keys = await redis.smembers('apikeys:pool');
        ctx.answerCbQuery();
        ctx.replyWithMarkdown(config.messages.info(keys.length, ctx.from.id), getMenu(ctx.from.id));
    });

    bot.action('view_owner', (ctx) => {
        ctx.answerCbQuery();
        ctx.replyWithMarkdown(`👤 *OWNER INFO*\n\nNama: ${config.owner.name}\nWhatsApp: ${config.owner.whatsapp}`, 
        Markup.inlineKeyboard([[Markup.button.url('Hubungi via WhatsApp', config.owner.waLink)]]));
    });

    // Command DelKey
    bot.command('delkey', async (ctx) => {
        if (!isOwner(ctx.from.id)) return;
        const index = parseInt(ctx.payload) - 1;
        const keys = await redis.smembers('apikeys:pool');
        if (keys[index]) {
            await redis.srem('apikeys:pool', keys[index]);
            ctx.reply(`✅ Key nomor ${index + 1} berhasil dihapus.`);
        } else {
            ctx.reply('❌ Nomor tidak valid. Contoh: /delkey 1');
        }
    });

    // --- HANDLER PESAN ---
    bot.on('text', async (ctx) => {
        const userId = ctx.from.id;
        const text = ctx.message.text;

        const state = await redis.get(`state:${userId}`);
        if (state === 'awaiting_key' && isOwner(userId)) {
            if (!text.startsWith('sk-or-')) return ctx.reply('❌ Key tidak valid!');
            await redis.sadd('apikeys:pool', text.trim()); // Simpan ke SET (otomatis unik)
            await redis.del(`state:${userId}`);
            return ctx.reply('✅ Key ditambahkan ke Pool!', getMenu(userId));
        }

        if (text.startsWith('/')) return;

        await ctx.sendChatAction('typing');

        // LOGIKA AUTO-RETRY (Failover)
        let keys = await redis.smembers('apikeys:pool');
        if (keys.length === 0) return ctx.reply('⚠️ Sistem sedang tidak memiliki API Key Aktif.');

        let success = false;
        let attempt = 0;

        // Coba maksimal 3 key berbeda jika terjadi error auth/saldo
        while (!success && attempt < Math.min(keys.length, 3)) {
            const currentKey = keys[attempt];
            try {
                const response = await axios.post(
                    'https://openrouter.ai/api/v1/chat/completions',
                    {
                        model: 'deepseek/deepseek-chat',
                        messages: [{ role: 'system', content: config.persona }, { role: 'user', content: text }]
                    },
                    { headers: { 'Authorization': `Bearer ${currentKey}` }, timeout: 45000 }
                );

                const aiResponse = response.data.choices?.[0]?.message?.content;
                await ctx.reply(aiResponse);

                // Kirim script file jika ada
                const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
                let match;
                while ((match = codeBlockRegex.exec(aiResponse)) !== null) {
                    const language = match[1] || 'txt';
                    const codeContent = match[2].trim();
                    await ctx.replyWithDocument({
                        source: Buffer.from(codeContent, 'utf-8'),
                        filename: `script_${Date.now()}.${getExt(language)}`
                    }, { caption: `📄 Script ${language.toUpperCase()}` });
                }

                success = true;
            } catch (error) {
                const status = error.response?.status;
                // Jika error 401 (Unauthorized) atau 402 (No Balance), hapus key otomatis
                if (status === 401 || status === 402) {
                    await redis.srem('apikeys:pool', currentKey);
                    console.log(`Key mati dihapus: ${currentKey.substring(0,10)}`);
                    attempt++; // Coba key berikutnya di loop berikutnya
                } else {
                    return ctx.reply('❌ Terjadi gangguan jaringan. Silakan coba lagi.');
                }
            }
        }

        if (!success) ctx.reply('❌ Semua API Key di database mati/habis saldo. Silakan hubungi Owner.');
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
