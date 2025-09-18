import { Page } from "playwright";
import { LocatorStore } from "./LocatorStore";
import { SelfHealingHelper } from "./SelfHealingHelper";
import { Logger, LogLevel } from "./Logger";

export interface SelfHealingConfig {
    logLevel?: LogLevel; // "silent" | "info" | "debug"
}

export interface SelfHealingConfig {
    enableLogs?: boolean; // default true
}

export class SelfHealingPage {
    private helper: SelfHealingHelper;
    private store: LocatorStore;

    constructor(private page: Page, private config: SelfHealingConfig = {}) {
        Logger.configure(config.logLevel || "info");

        this.store = new LocatorStore();
        this.helper = new SelfHealingHelper(this.page, this.store);
    }

    /**
     * Returns a proxy Locator wrapper.
     * Any Playwright Locator action (click, fill, type, press, hover, check, selectOption, etc.)
     * will automatically run through self-healing logic.
     */
    locator(selector: string) {
        const self = this;

        return new Proxy(
            {},
            {
                get(_target, propKey: string) {
                    return async (...args: any[]) => {
                        // Resolve the element with healing
                        const resolved = await self.helper.find(selector);

                        // Get the method being called (e.g., click, fill, type, hover, etc.)
                        const fn = (resolved as any)[propKey];
                        if (typeof fn !== "function") {
                            throw new Error(`[SelfHealing] Locator has no method: ${propKey}`);
                        }

                        Logger.info(`[SelfHealing] Executing action: ${propKey} on selector: ${selector}`);
                        return fn.apply(resolved, args);
                    };
                },
            }
        );
    }
}
