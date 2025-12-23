
const { Telegraf } = require('telegraf');
const crypto = require('crypto');
const config = require('./config');
const redis = require('./_lib/db');
const ui = require('./_lib/ui');
const aiChat = require('./_lib/ai');

const bot = new Telegraf(process.env.BOT_TOKEN);

module.exports = async (req, res) => {
    try {
        const isOwner = (id) => id.toString() === config.ownerId;

        // --- MENU LOGIC ---
        bot.start((ctx) => {
            ctx.replyWithMarkdown("👋 *Selamat Datang!*\n\nUntuk pergi ke menu klik button menu di bawah ini:", ui.startMenu);
        });

        const showMenu = async (ctx) => {
            const cap = `✨ *Welcome to ${config.botName}*`;
            try {
                await ctx.replyWithPhoto(config.menuImage, { caption: cap, parse_mode: 'Markdown', ...ui.mainMenu(isOwner(ctx.from.id)) });
            } catch (e) {
                await ctx.replyWithMarkdown(cap, ui.mainMenu(isOwner(ctx.from.id)));
            }
        };

        bot.command('menu', showMenu);
        bot.action('open_menu', (ctx) => { ctx.answerCbQuery(); showMenu(ctx); });

        // --- OWNER COMMANDS ---
        bot.command('adduser', async (ctx) => {
            if (!isOwner(ctx.from.id)) return;
            await redis.set(`state:${ctx.from.id}`, 'vip_1', { ex: 300 });
            ctx.reply("🛠️ *Mode VIP*\n1. Masukkan Nama AI:");
        });

        bot.command('edituser', async (ctx) => {
            if (!isOwner(ctx.from.id)) return;
            const target = ctx.payload.trim();
            if (!target) return ctx.reply("Gunakan: /edituser <ID>");
            const hasVip = await redis.get(`user_vip:${target}`);
            if (!hasVip) return ctx.reply("❌ User tidak punya VIP.");
            ctx.reply(`🔄 *Update User ${target}*\nPilih bagian:`, ui.editUserMenu(target));
        });

        // --- CALLBACKS ---
        bot.action('setup_key', async (ctx) => {
            await redis.set(`state:${ctx.from.id}`, 'awaiting_key', { ex: 300 });
            ctx.answerCbQuery();
            ctx.reply("🔑 Kirim API Key OpenRouter:");
        });

        bot.action('list_keys', async (ctx) => {
            const keys = await redis.smembers('apikeys:pool');
            ctx.answerCbQuery();
            ctx.replyWithMarkdown(keys.length ? `📜 *POOL KEY*\n\n${keys.map((k,i)=>`${i+1}. \`${k.substring(0,10)}...\``).join('\n')}` : "Kosong");
        });

        const editParts = ['edit_ai', 'edit_own', 'edit_wa'];
        editParts.forEach(p => {
            bot.action(new RegExp(`${p}:(.+)`), async (ctx) => {
                const target = ctx.match[1];
                const field = p.split('_')[1];
                await redis.set(`state:${ctx.from.id}`, `process_edit:${field}:${target}`, { ex: 300 });
                ctx.answerCbQuery();
                ctx.reply(`Kirim ${field} baru untuk ID ${target}:`);
            });
        });

        // --- MESSAGE HANDLER ---
        bot.on('text', async (ctx) => {
            const userId = ctx.from.id;
            const text = ctx.message.text;
            const state = await redis.get(`state:${userId}`);

            // 1. ADD USER (FIXED STUCK)
            if (state === 'vip_1' && isOwner(userId)) {
                await redis.set(`temp:${userId}`, { ai: text }); // Store as Object
                await redis.set(`state:${userId}`, 'vip_2', { ex: 300 });
                return ctx.reply("2. Masukkan Nama Owner VIP:");
            }
            if (state === 'vip_2' && isOwner(userId)) {
                const data = await redis.get(`temp:${userId}`) || {};
                await redis.set(`temp:${userId}`, { ...data, own: text });
                await redis.set(`state:${userId}`, 'vip_3', { ex: 300 });
                return ctx.reply("3. Masukkan Nomor WA:");
            }
            if (state === 'vip_3' && isOwner(userId)) {
                const data = await redis.get(`temp:${userId}`) || {};
                const token = crypto.randomBytes(3).toString('hex').toUpperCase();
                await redis.set(`vip_token:${token}`, { aiName: data.ai, ownerName: data.own, waNumber: text });
                await redis.del(`state:${userId}`); await redis.del(`temp:${userId}`);
                return ctx.replyWithMarkdown(`✅ *TOKEN:* \`${token}\``);
            }

            // 2. EDIT USER (FIXED)
            if (state?.startsWith('process_edit:') && isOwner(userId)) {
                const [_, field, targetId] = state.split(':');
                const userToken = await redis.get(`user_vip:${targetId}`);
                const userData = await redis.get(`vip_token:${userToken}`) || {};
                
                if (field === 'ai') userData.aiName = text;
                else if (field === 'own') userData.ownerName = text;
                else if (field === 'wa') userData.waNumber = text;

                await redis.set(`vip_token:${userToken}`, userData);
                await redis.del(`state:${userId}`);
                return ctx.reply(`✅ Berhasil update ${field} untuk ${targetId}`);
            }

            // 3. OTHER STATES
            if (state === 'awaiting_key' && isOwner(userId)) {
                await redis.sadd('apikeys:pool', text.trim());
                await redis.del(`state:${userId}`);
                return ctx.reply("✅ Key ditambahkan.");
            }
            if (state === 'waiting_token') {
                const data = await redis.get(`vip_token:${text.toUpperCase()}`);
                if (!data) return ctx.reply("❌ Token salah.");
                await redis.set(`user_vip:${userId}`, text.toUpperCase());
                await redis.del(`state:${userId}`);
                return ctx.reply("✅ VIP Berhasil!");
            }

            if (text.startsWith('/')) return;

            // --- AI CHAT ---
            try {
                await ctx.sendChatAction('typing');
                const response = await aiChat(userId, text);
                await ctx.reply(response);
            } catch (e) { ctx.reply("❌ Gangguan AI."); }
        });

        if (req.method === 'POST') await bot.handleUpdate(req.body, res);
        else res.status(200).send('Online');

    } catch (e) {
        console.error(e);
        res.status(200).send('Error Ignored');
    }
};
