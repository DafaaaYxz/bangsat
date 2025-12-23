
const { Telegraf } = require('telegraf');

const bot = new Telegraf(process.env.BOT_TOKEN);

bot.start((ctx) => ctx.reply('Bot aktif!'));
bot.command('ping', (ctx) => ctx.reply('pong'));

module.exports = async (req, res) => {
  try {
    // Pastikan hanya menerima request POST
    if (req.method === 'POST') {
      await bot.handleUpdate(req.body);
      res.status(200).send('OK');
    } else {
      res.status(200).send('Sepertinya bot sedang berjalan...');
    }
  } catch (e) {
    console.error('Error:', e);
    // Kirim status 200 ke Telegram agar mereka tidak mencoba mengirim ulang pesan yang error
    res.status(200).send('Error ignored');
  }
};
