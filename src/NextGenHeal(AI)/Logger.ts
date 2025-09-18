export type LogLevel = "silent" | "info" | "debug";

export class Logger {
    private static level: LogLevel = "info"; // default

    static configure(level: LogLevel) {
        this.level = level;
    }

    static info(message: string) {
        if (this.level === "info" || this.level === "debug") {
            console.log("[SELF-HEALING][INFO]", message);
        }
    }

    static debug(message: string) {
        if (this.level === "debug") {
            console.debug("[SELF-HEALING][DEBUG]", message);
        }
    }

    static warn(message: string) {
        if (this.level === "info" || this.level === "debug") {
            console.warn("[SELF-HEALING][WARN]", message);
        }
    }

    static error(message: string) {
        console.error("[SELF-HEALING][ERROR]", message);
    }
}
