
const { Telegraf } = require('telegraf');

module.exports = async (req, res) => {
    // 1. Ambil token di dalam handler untuk memastikan variable terbaca
    const token = process.env.BOT_TOKEN;

    // 2. Validasi token (Jika ini muncul di log, berarti variabel Vercel memang belum masuk)
    if (!token) {
        console.error("ERROR: BOT_TOKEN tidak ditemukan di Environment Variables Vercel!");
        return res.status(200).send('Token missing'); 
    }

    const bot = new Telegraf(token);

    // Definisi fitur bot
    bot.start((ctx) => ctx.reply('Bot Berhasil Aktif!'));
    bot.command('ping', (ctx) => ctx.reply('pong!'));
    bot.on('text', (ctx) => ctx.reply(`Anda menulis: ${ctx.message.text}`));

    try {
        if (req.method === 'POST') {
            await bot.handleUpdate(req.body);
            return res.status(200).send('OK');
        } else {
            return res.status(200).send('Bot is running...');
        }
    } catch (err) {
        console.error('Error saat handle update:', err);
        return res.status(200).send('Error'); // Tetap kirim 200 agar Telegram tidak spam retry
    }
};
