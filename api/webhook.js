
const { Telegraf } = require('telegraf');
const crypto = require('crypto');
const config = require('./config');
const redis = require('./_lib/db');
const ui = require('./_lib/ui');
const aiChat = require('./_lib/ai');

module.exports = async (req, res) => {
    const bot = new Telegraf(process.env.BOT_TOKEN);
    const isOwner = (id) => id.toString() === config.ownerId;

    // --- START & MENU ---
    bot.start((ctx) => {
        ctx.replyWithMarkdown("👋 *Selamat Datang!*\n\nUntuk pergi ke menu klik button menu di bawah ini:", ui.startMenu);
    });

    const showMenu = async (ctx) => {
        const caption = `✨ *Welcome to ${config.botName}*\n\nSilakan pilih menu di bawah ini untuk mengelola akun atau bertanya kepada AI.`;
        await ctx.replyWithPhoto(config.menuImage, {
            caption: caption,
            parse_mode: 'Markdown',
            ...ui.mainMenu(isOwner(ctx.from.id))
        });
    };

    bot.command('menu', showMenu);
    bot.action('open_menu', (ctx) => { ctx.answerCbQuery(); showMenu(ctx); });

    // --- OWNER COMMANDS (VIP MANAGEMENT) ---
    bot.command('adduser', async (ctx) => {
        if (!isOwner(ctx.from.id)) return;
        await redis.set(`state:${ctx.from.id}`, 'vip_1');
        ctx.reply("🛠️ *Mode VIP* - Masukkan Nama AI:");
    });

    bot.command('edituser', async (ctx) => {
        if (!isOwner(ctx.from.id)) return;
        const target = ctx.payload.trim();
        if (!target) return ctx.reply("Gunakan: /edituser ID");
        await redis.set(`state:${ctx.from.id}`, `edit_1:${target}`);
        ctx.reply(`🔄 Edit User ${target} - Masukkan Nama AI Baru:`);
    });

    bot.command('deluser', async (ctx) => {
        if (!isOwner(ctx.from.id)) return;
        await redis.del(`user_vip:${ctx.payload.trim()}`);
        ctx.reply("✅ VIP Dicabut.");
    });

    // --- ACTIONS (CALLBACK) ---
    bot.action('info_user', async (ctx) => {
        const chatCount = await redis.get(`chat_count:${ctx.from.id}`) || 0;
        ctx.answerCbQuery();
        ctx.replyWithMarkdown(`📊 *INFO AKUN*\n\nID: \`${ctx.from.id}\`\nChat: ${chatCount} kali`);
    });

    bot.action('view_owner', async (ctx) => {
        let wa = config.defaultWa;
        const vip = await redis.get(`user_vip:${ctx.from.id}`);
        if (vip) {
            const data = await redis.get(`vip_token:${vip}`);
            if (data) wa = data.waNumber;
        }
        ctx.answerCbQuery();
        ctx.replyWithMarkdown(`📱 *KONTAK OWNER*\n\nHubungi melalui tombol di bawah:`, 
        { reply_markup: { inline_keyboard: [[{ text: 'WhatsApp', url: `https://wa.me/${wa}` }]] } });
    });

    bot.action('upload_token', (ctx) => {
        redis.set(`state:${ctx.from.id}`, 'waiting_token');
        ctx.reply("🎟️ Masukkan Token VIP:");
    });

    bot.action('setup_key', (ctx) => {
        redis.set(`state:${ctx.from.id}`, 'awaiting_key');
        ctx.reply("🔑 Kirim API Key OpenRouter:");
    });

    bot.action('list_user', async (ctx) => {
        const keys = await redis.keys('user_vip:*');
        let txt = "👥 *USER VIP LIST*\n\n";
        for (const k of keys) {
            const id = k.split(':')[1];
            const data = await redis.get(`vip_token:${await redis.get(k)}`);
            txt += `• \`${id}\` (${data?.aiName})\n`;
        }
        ctx.replyWithMarkdown(txt + "\nDetail: /edituser ID");
    });

    // --- MESSAGE HANDLER ---
    bot.on('text', async (ctx) => {
        const userId = ctx.from.id;
        const text = ctx.message.text;
        const state = await redis.get(`state:${userId}`);

        // Handle Add & Edit User VIP
        if (state === 'vip_1') {
            await redis.set(`temp:${userId}`, JSON.stringify({ ai: text }));
            await redis.set(`state:${userId}`, 'vip_2');
            return ctx.reply("Masukkan Nama Owner:");
        }
        if (state === 'vip_2') {
            const temp = JSON.parse(await redis.get(`temp:${userId}`));
            await redis.set(`temp:${userId}`, JSON.stringify({ ...temp, own: text }));
            await redis.set(`state:${userId}`, 'vip_3');
            return ctx.reply("Masukkan No WhatsApp:");
        }
        if (state === 'vip_3') {
            const temp = JSON.parse(await redis.get(`temp:${userId}`));
            const token = crypto.randomBytes(3).toString('hex').toUpperCase();
            await redis.set(`vip_token:${token}`, { aiName: temp.ai, ownerName: temp.own, waNumber: text });
            await redis.del(`state:${userId}`);
            return ctx.replyWithMarkdown(`✅ *TOKEN:* \`${token}\``);
        }

        // Handle State Upload Token
        if (state === 'waiting_token') {
            const data = await redis.get(`vip_token:${text.toUpperCase()}`);
            if (!data) return ctx.reply("❌ Token salah.");
            await redis.set(`user_vip:${userId}`, text.toUpperCase());
            await redis.del(`state:${userId}`);
            return ctx.reply("✅ Berhasil Aktif!");
        }

        if (text.startsWith('/')) return;

        // --- AI CHAT PROCESS ---
        try {
            await ctx.sendChatAction('typing');
            await redis.incr(`chat_count:${userId}`);
            const response = await aiChat(userId, text);
            await ctx.reply(response);
            
            const codeBlock = /```(\w*)\n([\s\S]*?)```/g;
            let m;
            while ((m = codeBlock.exec(response)) !== null) {
                await ctx.replyWithDocument({ source: Buffer.from(m[2].trim(), 'utf-8'), filename: `script_${Date.now()}.txt` });
            }
        } catch (e) {
            ctx.reply(e.message === "API_EMPTY" ? "⚠️ API Key Pool Kosong." : "❌ Terjadi gangguan.");
        }
    });

    if (req.method === 'POST') await bot.handleUpdate(req.body);
    res.status(200).send('OK');
};
