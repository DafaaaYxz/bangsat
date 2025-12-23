
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
    },

    // Menu Baru untuk Edit User
    editUserMenu: (targetId) => Markup.inlineKeyboard([
        [Markup.button.callback('🤖 Nama AI', `edit_ai:${targetId}`)],
        [Markup.button.callback('👤 Nama Owner', `edit_own:${targetId}`)],
        [Markup.button.callback('📱 Nomor WhatsApp', `edit_wa:${targetId}`)],
        [Markup.button.callback('❌ Batal', 'open_menu')]
    ])
};
