
module.exports = {
    botName: "XdpzQ-AI",
    // ID Telegram Anda (Owner)
    ownerId: "7341190291", 
    
    persona: "Kamu adalah XdpzQ-AI. Jika user meminta kode program, berikan penjelasan singkat lalu tulis kodenya di dalam format ```nama_bahasa ... ```. Kamu cerdas dan membantu.",

    owner: {
        name: "XdpzQ",
        whatsapp: "085736486023",
        waLink: "https://wa.me/6285736486023"
    },

    messages: {
        welcome: "👋 *Halo! Selamat datang di XdpzQ-AI*\n\nSaya asisten AI cerdas. Silakan tanya apa saja, saya akan menjawabnya!",
        welcomeOwner: "👋 *Halo Boss XdpzQ!*\n\nBot berjalan normal. Gunakan tombol di bawah untuk mengelola API Key Global.",
        info: (status, id) => `📊 *STATUS SISTEM*\n\n🆔 ID Anda: \`${id}\` \n🔌 API Sistem: ${status}`
    }
};
