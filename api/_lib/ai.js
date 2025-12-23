const axios = require('axios');
const redis = require('./db');
const config = require('../config');

module.exports = async (userId, text) => {
    const keys = await redis.smembers('apikeys:pool');
    if (keys.length === 0) throw new Error("API_EMPTY");

    let aiName = config.botName, ownerName = config.defaultOwnerName;
    const userVip = await redis.get(`user_vip:${userId}`);
    if (userVip) {
        const d = await redis.get(`vip_token:${userVip}`);
        if (d) { aiName = d.aiName; ownerName = d.ownerName; }
    }

    let attempt = 0;
    while (attempt < Math.min(keys.length, 3)) {
        const currentKey = keys[attempt];
        try {
            const res = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
                model: 'deepseek/deepseek-chat',
                messages: [
                    { role: 'system', content: config.persona(aiName, ownerName) },
                    { role: 'user', content: text }
                ]
            }, { headers: { 'Authorization': `Bearer ${currentKey}` }, timeout: 50000 });
            return res.data.choices[0].message.content;
        } catch (e) {
            if (e.response?.status === 401 || e.response?.status === 402) {
                await redis.srem('apikeys:pool', currentKey);
                attempt++;
            } else throw e;
        }
    }
    throw new Error("FAILOVER_FAILED");
};
