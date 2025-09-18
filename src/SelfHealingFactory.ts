// SelfHealingFactory.ts
import { config } from "../config";
import { Page } from "@playwright/test";
import { SelfHealingPage as NonAIPage } from "@core/HeuristicHeal(Non_AI)/SelfHealingPage";
import {SelfHealingPage as AIPage} from "@core/NextGenHeal(AI)/SelfHealingPage";
export async function getSelfHealingPage(page: Page) {
    if (config.AI_ENABLED) {

        // const { SelfHealingPage: AIPage } = await import("./NextGenHeal(AI)/SelfHealingPage.js");
        return new AIPage(page);
    } else {
        return new NonAIPage(page, config.STRATEGY_FILE);
    }
}
