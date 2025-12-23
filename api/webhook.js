
const { Telegraf, Markup } = require('telegraf');
const crypto = require('crypto');
const config = require('./config');
const redis = require('./_lib/db');
const ui = require('./_lib/ui');
const aiChat = require('./_lib/ai');

module.exports = async (req, res) => {
    const bot = new Telegraf(process.env.BOT_TOKEN);
    const isOwner = (id) => id.toString() === config.ownerId;

    bot.start((ctx) => {
        ctx.replyWithMarkdown("👋 *Selamat Datang!*\n\nUntuk pergi ke menu klik button menu di bawah ini:", ui.startMenu);
    });

    const showMenu = async (ctx) => {
        const caption = `✨ *Welcome to ${config.botName}*\n\nSilakan pilih menu di bawah ini.`;
        await ctx.replyWithPhoto(config.menuImage, {
            caption, parse_mode: 'Markdown', ...ui.mainMenu(isOwner(ctx.from.id))
        });
    };

    bot.command('menu', showMenu);
    bot.action('open_menu', (ctx) => { ctx.answerCbQuery(); showMenu(ctx); });

    // --- FITUR EDIT USER (FIXED) ---
    bot.command('edituser', async (ctx) => {
        if (!isOwner(ctx.from.id)) return;
        const targetId = ctx.payload.trim();
        if (!targetId) return ctx.reply("Gunakan: /edituser <ID>");
        
        const hasToken = await redis.get(`user_vip:${targetId}`);
        if (!hasToken) return ctx.reply("❌ User tidak memiliki VIP.");

        ctx.reply(`🔄 *Update User:* \`${targetId}\`\nPilih bagian yang ingin diubah:`, ui.editUserMenu(targetId));
    });

    // Action Handler untuk milih bagian Edit
    const editParts = ['edit_ai', 'edit_own', 'edit_wa'];
    editParts.forEach(part => {
        bot.action(new RegExp(`${part}:(.+)`), async (ctx) => {
            const targetId = ctx.match[1];
            const field = part.split('_')[1];
            await redis.set(`state:${ctx.from.id}`, `process_edit:${field}:${targetId}`, { ex: 300 });
            ctx.answerCbQuery();
            const label = field === 'ai' ? 'Nama AI' : field === 'own' ? 'Nama Owner' : 'Nomor WhatsApp';
            ctx.reply(`Silakan masukkan *${label}* baru untuk user \`${targetId}\`:`, { parse_mode: 'Markdown' });
        });
    });

    // --- OWNER COMMANDS ---
    bot.command('adduser', async (ctx) => {
        if (!isOwner(ctx.from.id)) return;
        await redis.set(`state:${ctx.from.id}`, 'vip_1', { ex: 300 });
        ctx.reply("🛠️ *TAMBAH VIP*\n1. Masukkan Nama AI:");
    });

    bot.command('deluser', async (ctx) => {
        if (!isOwner(ctx.from.id)) return;
        const id = ctx.payload.trim();
        await redis.del(`user_vip:${id}`);
        ctx.reply(`✅ VIP User ${id} dihapus.`);
    });

    // --- OTHER ACTIONS ---
    bot.action('setup_key', async (ctx) => {
        await redis.set(`state:${ctx.from.id}`, 'awaiting_key', { ex: 300 });
        ctx.answerCbQuery();
        ctx.reply("🔑 Kirim API Key OpenRouter:");
    });

    bot.action('list_keys', async (ctx) => {
        ctx.answerCbQuery();
        const keys = await redis.smembers('apikeys:pool');
        let txt = "📜 *POOL KEY*\n\n" + keys.map((k, i) => `${i+1}. \`${k.substring(0,10)}...\``).join('\n');
        ctx.replyWithMarkdown(txt || "Kosong");
    });

    bot.action('list_user', async (ctx) => {
        ctx.answerCbQuery();
        const keys = await redis.keys('user_vip:*');
        let txt = "👥 *LIST VIP*\n\n";
        for (const k of keys) {
            const id = k.split(':')[1];
            const t = await redis.get(k);
            const d = await redis.get(`vip_token:${t}`);
            txt += `👤 \`${id}\` - AI: ${d?.aiName}\n`;
        }
        ctx.replyWithMarkdown(txt || "Kosong.");
    });

    bot.action('upload_token', (ctx) => {
        ctx.answerCbQuery();
        redis.set(`state:${ctx.from.id}`, 'waiting_token', { ex: 300 });
        ctx.reply("🎟️ Masukkan Token VIP:");
    });

    // --- MESSAGE HANDLER (FIXED LOGIC) ---
    bot.on('text', async (ctx) => {
        const userId = ctx.from.id;
        const text = ctx.message.text;
        const state = await redis.get(`state:${userId}`);

        if (!state && text.startsWith('/')) return;

        // 1. Logic ADD USER (FIXED STUCK)
        if (state === 'vip_1' && isOwner(userId)) {
            await redis.set(`temp:${userId}`, JSON.stringify({ ai: text }));
            await redis.set(`state:${userId}`, 'vip_2', { ex: 300 });
            return ctx.reply("2. Masukkan Nama Owner:");
        }
        if (state === 'vip_2' && isOwner(userId)) {
            const data = JSON.parse(await redis.get(`temp:${userId}`) || '{}');
            await redis.set(`temp:${userId}`, JSON.stringify({ ...data, own: text }));
            await redis.set(`state:${userId}`, 'vip_3', { ex: 300 });
            return ctx.reply("3. Masukkan No WhatsApp:");
        }
        if (state === 'vip_3' && isOwner(userId)) {
            const data = JSON.parse(await redis.get(`temp:${userId}`) || '{}');
            const token = crypto.randomBytes(3).toString('hex').toUpperCase();
            await redis.set(`vip_token:${token}`, { aiName: data.ai, ownerName: data.own, waNumber: text });
            await redis.del(`state:${userId}`); await redis.del(`temp:${userId}`);
            return ctx.replyWithMarkdown(`✅ *TOKEN:* \`${token}\``);
        }

        // 2. Logic EDIT USER (FIXED)
        if (state?.startsWith('process_edit:') && isOwner(userId)) {
            const [_, field, targetId] = state.split(':');
            const userToken = await redis.get(`user_vip:${targetId}`);
            const userData = await redis.get(`vip_token:${userToken}`);
            
            if (field === 'ai') userData.aiName = text;
            if (field === 'own') userData.ownerName = text;
            if (field === 'wa') userData.waNumber = text;

            await redis.set(`vip_token:${userToken}`, userData);
            await redis.del(`state:${userId}`);
            return ctx.reply(`✅ Berhasil mengupdate ${field} untuk user \`${targetId}\`.`);
        }

        // 3. Tambah Key
        if (state === 'awaiting_key' && isOwner(userId)) {
            await redis.sadd('apikeys:pool', text.trim());
            await redis.del(`state:${userId}`);
            return ctx.reply("✅ Key ditambahkan.");
        }

        // 4. Upload Token
        if (state === 'waiting_token') {
            const data = await redis.get(`vip_token:${text.toUpperCase()}`);
            if (!data) return ctx.reply("❌ Token Salah.");
            await redis.set(`user_vip:${userId}`, text.toUpperCase());
            await redis.del(`state:${userId}`);
            return ctx.reply("✅ VIP Aktif.");
        }

        if (text.startsWith('/')) return;

        // --- CHAT AI ---
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
        } catch (e) { ctx.reply("❌ Gangguan AI."); }
    });

    if (req.method === 'POST') await bot.handleUpdate(req.body);
    res.status(200).send('OK');
};
