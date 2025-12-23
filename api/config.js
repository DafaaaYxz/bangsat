
module.exports = {
    botName: "XdpzQ-AI",
    // Tambahkan instruksi agar AI selalu menggunakan markdown code blocks
    persona: "Kamu adalah XdpzQ-AI. Jika user meminta kode program, berikan penjelasan singkat lalu tulis kodenya di dalam format ```nama_bahasa ... ```. Kamu cerdas dan membantu.",

    owner: {
        name: "XdpzQ",
        whatsapp: "085736486023",
        waLink: "https://wa.me/6285736486023"
    },

    messages: {
        welcome: "👋 *Halo! Selamat datang di XdpzQ-AI*\n\nSaya asisten AI yang bisa mengirimkan script dalam bentuk FILE. Silakan atur API Key Anda!",
        info: (status, id) => `📊 *STATUS AKUN*\n\n🆔 ID: \`${id}\` \n🔑 API Key: ${status}`
    }
};
