import { Page, Locator } from "@playwright/test";
import { SelfHealingHelper } from "./SelfHealingHelper";
import { Logger } from "./Logger";

/**
 * Non-NextGenHeal(AI) SelfHealingPage
 * Wraps Playwright Page and routes all locator actions through HeuristicHeal(Non_AI) SelfHealingHelper
 */
export class SelfHealingPage {
    private helper: SelfHealingHelper;

    constructor(private page: Page, fileName: string = "healingStore.json") {
        this.helper = new SelfHealingHelper(page, fileName);
    }

    /**
     * Returns a proxy Locator wrapper.
     * Any Playwright Locator action (click, fill, type, press, hover, etc.)
     * will automatically run through Non-NextGenHeal(AI) self-healing logic.
     */
    locator(selector: string): any {
        const self = this;

        return new Proxy(
            {},
            {
                get(_target: {}, propKey: string) {
                    return async (...args: any[]): Promise<any> => {
                        // Resolve the element with self-healing
                        const resolved: Locator = await self.helper.find(selector);

                        // Get the method being called (e.g., click, fill, type, hover)
                        const fn = (resolved as any)[propKey];
                        if (typeof fn !== "function") {
                            throw new Error(
                                `[SelfHealing] Locator has no method: ${propKey}`
                            );
                        }

                        Logger.debug(
                            `[SelfHealing] Executing ${propKey} on selector: ${selector}`
                        );
                        return fn.apply(resolved, args);
                    };
                },
            }
        );
    }
}
