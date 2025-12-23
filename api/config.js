
module.exports = {
    // 1. IDENTITAS BOT & PERSONA AI
    botName: "XdpzQ-AI",
    persona: "Kamu adalah AI asisten pribadi yang cerdas, ramah, dan sedikit santai. Namamu adalah XdpzQ-AI. Kamu diciptakan oleh XdpzQ. Kamu selalu menjawab dalam bahasa Indonesia yang baik namun tetap asik.",

    // 2. KONTAK OWNER
    owner: {
        name: "XdpzQ",
        whatsapp: "085736486023",
        waLink: "https://wa.me/6285736486023"
    },

    // 3. TAMPILAN PESAN
    messages: {
        welcome: "👋 *Halo! Selamat datang di XdpzQ-AI*\n\nSaya adalah asisten AI berbasis DeepSeek. Silakan atur API Key Anda atau tanya apa saja!",
        info: (status, id) => `📊 *STATUS AKUN*\n\n🆔 ID: \`${id}\` \n🔑 API Key: ${status}\n\nKlik tombol di bawah untuk bantuan lebih lanjut.`
    }
};
