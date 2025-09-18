export const config = {
    AI_ENABLED: process.env.AI_ENABLED === "true",   // strict comparison
    STRATEGY_FILE: process.env.STRATEGY_FILE || "healingStore.json",
};
