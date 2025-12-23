
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

    // --- OWNER ACTIONS (FIXED) ---
    bot.action('setup_key', async (ctx) => {
        if (!isOwner(ctx.from.id)) return ctx.answerCbQuery('Akses Ditolak');
        await redis.set(`state:${ctx.from.id}`, 'awaiting_key', { ex: 300 });
        ctx.answerCbQuery();
        ctx.reply("🔑 *MODE TAMBAH KEY*\nSilakan kirim API Key OpenRouter Anda (sk-or-v1-...):");
    });

    bot.action('list_keys', async (ctx) => {
        if (!isOwner(ctx.from.id)) return ctx.answerCbQuery('Akses Ditolak');
        ctx.answerCbQuery();
        const keys = await redis.smembers('apikeys:pool');
        if (keys.length === 0) return ctx.reply("⚠️ Pool API Key kosong.");

        let txt = "📜 *DAFTAR API KEY ANDA*\n\n";
        keys.forEach((k, i) => {
            txt += `${i + 1}. \`${k.substring(0, 15)}...\`\n`;
        });
        txt += "\n_Hapus dengan /delkey <nomor>_";
        ctx.replyWithMarkdown(txt);
    });

    bot.action('list_user', async (ctx) => {
        if (!isOwner(ctx.from.id)) return ctx.answerCbQuery();
        ctx.answerCbQuery();
        const keys = await redis.keys('user_vip:*');
        let txt = "👥 *USER VIP LIST*\n\n";
        for (const k of keys) {
            const id = k.split(':')[1];
            const token = await redis.get(k);
            const data = await redis.get(`vip_token:${token}`);
            txt += `👤 ID: \`${id}\`\n🤖 AI: ${data?.aiName}\n🗑 /deluser ${id}\n\n`;
        }
        ctx.replyWithMarkdown(txt || "Belum ada user VIP.");
    });

    // --- USER ACTIONS ---
    bot.action('info_user', async (ctx) => {
        const chatCount = await redis.get(`chat_count:${ctx.from.id}`) || 0;
        const isVip = await redis.get(`user_vip:${ctx.from.id}`);
        ctx.answerCbQuery();
        ctx.replyWithMarkdown(`📊 *INFO AKUN*\n\n🆔 ID: \`${ctx.from.id}\`\n🌟 Status: ${isVip ? 'VIP' : 'Standar'}\n💬 Total Chat: ${chatCount} kali`);
    });

    bot.action('view_owner', async (ctx) => {
        let wa = config.defaultWa;
        const vipToken = await redis.get(`user_vip:${ctx.from.id}`);
        if (vipToken) {
            const data = await redis.get(`vip_token:${vipToken}`);
            if (data) wa = data.waNumber;
        }
        ctx.answerCbQuery();
        ctx.replyWithMarkdown(`📱 *KONTAK OWNER*\n\nHubungi melalui tombol di bawah:`, 
        { reply_markup: { inline_keyboard: [[{ text: 'WhatsApp', url: `https://wa.me/${wa.replace(/[^0-9]/g, '')}` }]] } });
    });

    bot.action('upload_token', (ctx) => {
        redis.set(`state:${ctx.from.id}`, 'waiting_token', { ex: 300 });
        ctx.answerCbQuery();
        ctx.reply("🎟️ Silakan masukkan Token VIP Anda:");
    });

    // --- OWNER COMMANDS ---
    bot.command('adduser', async (ctx) => {
        if (!isOwner(ctx.from.id)) return;
        await redis.set(`state:${ctx.from.id}`, 'vip_1');
        ctx.reply("🛠️ *TAMBAH VIP*\n1. Masukkan Nama AI:");
    });

    bot.command('delkey', async (ctx) => {
        if (!isOwner(ctx.from.id)) return;
        const index = parseInt(ctx.payload) - 1;
        const keys = await redis.smembers('apikeys:pool');
        if (keys[index]) {
            await redis.srem('apikeys:pool', keys[index]);
            ctx.reply(`✅ Key nomor ${index + 1} dihapus.`);
        } else ctx.reply("Gunakan: /delkey 1");
    });

    // --- MESSAGE HANDLER (FIXED STATE LOGIC) ---
    bot.on('text', async (ctx) => {
        const userId = ctx.from.id;
        const text = ctx.message.text;
        const state = await redis.get(`state:${userId}`);

        // 1. Handle State Tambah API Key (FIXED)
        if (state === 'awaiting_key' && isOwner(userId)) {
            if (!text.startsWith('sk-or-')) return ctx.reply("❌ Salah! Key OpenRouter harus diawali 'sk-or-'.");
            await redis.sadd('apikeys:pool', text.trim());
            await redis.del(`state:${userId}`);
            return ctx.reply("✅ API Key berhasil ditambahkan ke Pool Sistem!");
        }

        // 2. Handle State Add User VIP
        if (state === 'vip_1') {
            await redis.set(`temp:${userId}`, JSON.stringify({ ai: text }));
            await redis.set(`state:${userId}`, 'vip_2');
            return ctx.reply("2. Masukkan Nama Owner:");
        }
        if (state === 'vip_2') {
            const temp = JSON.parse(await redis.get(`temp:${userId}`));
            await redis.set(`temp:${userId}`, JSON.stringify({ ...temp, own: text }));
            await redis.set(`state:${userId}`, 'vip_3');
            return ctx.reply("3. Masukkan No WhatsApp (08xxx):");
        }
        if (state === 'vip_3') {
            const temp = JSON.parse(await redis.get(`temp:${userId}`));
            const tokenVip = crypto.randomBytes(3).toString('hex').toUpperCase();
            await redis.set(`vip_token:${tokenVip}`, { aiName: temp.ai, ownerName: temp.own, waNumber: text });
            await redis.del(`state:${userId}`);
            return ctx.replyWithMarkdown(`✅ *TOKEN VIP:* \`${tokenVip}\`\nBerikan ke user.`);
        }

        // 3. Handle State Upload Token
        if (state === 'waiting_token') {
            const data = await redis.get(`vip_token:${text.toUpperCase()}`);
            if (!data) return ctx.reply("❌ Token tidak ditemukan.");
            await redis.set(`user_vip:${userId}`, text.toUpperCase());
            await redis.del(`state:${userId}`);
            return ctx.reply("✅ VIP Berhasil Diaktifkan!");
        }

        if (text.startsWith('/')) return;

        // --- 4. CHAT AI PROCESS ---
        try {
            await ctx.sendChatAction('typing');
            await redis.incr(`chat_count:${userId}`);
            const response = await aiChat(userId, text);
            await ctx.reply(response);
            
            // Auto-Script to File
            const codeBlock = /```(\w*)\n([\s\S]*?)```/g;
            let m;
            while ((m = codeBlock.exec(response)) !== null) {
                await ctx.replyWithDocument({ 
                    source: Buffer.from(m[2].trim(), 'utf-8'), 
                    filename: `script_${Date.now()}.txt` 
                });
            }
        } catch (e) {
            ctx.reply(e.message === "API_EMPTY" ? "⚠️ API Key Sistem Kosong. Hubungi Owner." : "❌ Terjadi gangguan server AI.");
        }
    });

    if (req.method === 'POST') await bot.handleUpdate(req.body);
    res.status(200).send('OK');
};
