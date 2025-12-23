const { Markup } = require('telegraf');

module.exports = {
    startMenu: Markup.inlineKeyboard([
        [Markup.button.callback('Buka Menu Utama 🚀', 'open_menu')]
    ]),
    
    mainMenu: (isOwner) => {
        const buttons = [
            [Markup.button.callback('📊 Info Akun', 'info_user'), Markup.button.callback('👤 Owner', 'view_owner')],
            [Markup.button.callback('🎟️ Upload Token VIP', 'upload_token')]
        ];
        if (isOwner) {
            buttons.unshift([Markup.button.callback('➕ API Key', 'setup_key'), Markup.button.callback('📜 List Keys', 'list_keys')]);
            buttons.push([Markup.button.callback('👥 List User VIP', 'list_user')]);
        }
        return Markup.inlineKeyboard(buttons);
    }
};
