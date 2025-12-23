
module.exports = {
    botName: "XdpzQ-AI",
    ownerId: "7341190291", 
    
    persona: "Kamu adalah XdpzQ-AI. Jika user meminta kode program, berikan penjelasan singkat lalu tulis kodenya di dalam format ```nama_bahasa ... ```. Kamu cerdas dan membantu.",

    owner: {
        name: "XdpzQ",
        whatsapp: "085736486023",
        waLink: "https://wa.me/6285736486023"
    },

    messages: {
        welcome: "👋 *Halo! Selamat datang di XdpzQ-AI*\n\nSaya asisten AI cerdas. Silakan tanya apa saja!",
        welcomeOwner: "👋 *Halo Boss XdpzQ!*\n\nSistem API Pool Aktif. Anda bisa menambah banyak key sekaligus.",
        info: (count, id) => `📊 *STATUS SISTEM*\n\n🆔 ID Anda: \`${id}\` \n🔑 Total API Key Aktif: *${count}*`
    }
};
