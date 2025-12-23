const { Telegraf } = require('telegraf');

// Inisialisasi bot menggunakan Token dari Environment Variable Vercel
const bot = new Telegraf(process.env.BOT_TOKEN);

// 1. Fitur /start
bot.start((ctx) => {
    ctx.reply('Halo! Saya bot yang berjalan stabil di Vercel Serverless (Webhook Mode).');
});

// 2. Fitur /ping
bot.command('ping', (ctx) => {
    ctx.reply('pong');
});

// 3. Fitur /info
bot.command('info', (ctx) => {
    const user = ctx.from;
    const info = `
📌 *User Info*
👤 Nama: ${user.first_name} ${user.last_name || ''}
🆔 ID: \`${user.id}\`
🌐 Username: @${user.username || '-'}
    `;
    ctx.replyWithMarkdown(info);
});

// 4. Pesan Biasa (Echo)
bot.on('text', (ctx) => {
    ctx.reply(`Kamu bilang: ${ctx.message.text}`);
});

// Handler utama untuk Vercel
module.exports = async (req, res) => {
    try {
        if (req.method === 'POST') {
            // Memproses update dari Telegram
            await bot.handleUpdate(req.body, res);
        } else {
            res.status(200).send('Bot sedang berjalan...');
        }
    } catch (error) {
        console.error('Error handling update:', error);
        res.status(500).send('Error');
    }
};
