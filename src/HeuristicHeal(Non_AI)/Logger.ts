// Logger.ts
export class Logger {
    private static enabled = true;

    static configure(enabled: boolean) {
        Logger.enabled = enabled;
    }

    static info(message: string) {
        if (Logger.enabled) {
            console.log(`[SELF-HEALING][INFO] ${message}`);
        }
    }

    static error(message: string) {
        if (Logger.enabled) {
            console.error(`[SELF-HEALING][ERROR] ${message}`);
        }
    }

    static debug(message: string) {
        if (Logger.enabled) {
            console.debug(`[SELF-HEALING][Debug] ${message}`);
        }
    }
}
