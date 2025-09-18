import { Page } from "@playwright/test";
import { LocatorStore } from "./LocatorStore";
import { generateLocatorCandidatesWithAI } from "./HealingStrategies";
import { Logger } from "./Logger";

export class SelfHealingHelper {
    private store = new LocatorStore();

    // @ts-ignore
    constructor(private page: Page,private store: LocatorStore) {}

    async find(selector: string) {
        const getLocator = (sel: string) =>
            sel.startsWith("/") || sel.startsWith("//")
                ? this.page.locator(`xpath=${sel}`)
                : this.page.locator(sel);

        const locator = getLocator(selector);
        const count = await locator.count();

        // =====================================================
        // Case 1: DOM structure still exists
        // =====================================================
        if (count > 0) {
            try {
                // Try original selector
                await locator.first().waitFor({ state: "visible", timeout: 2000 });

                // Enrich with NextGenHeal(AI) candidates using parent DOM context
                const handle = await locator.first().elementHandle();
                if (handle) {
                    const domSnippet = await handle.evaluate((el) => {
                        const parent = el.parentElement;
                        return parent ? parent.outerHTML : el.outerHTML;
                    });

                    let aiCandidates = await generateLocatorCandidatesWithAI(domSnippet, selector);

                    Logger.debug("[SELF-HEALING] Raw NextGenHeal(AI) candidates (element exists): " + aiCandidates.map(c => c.selector).join(", "));

                    // Validate + dedup
                    aiCandidates = await this.filterValidCandidates(aiCandidates);

                    if (aiCandidates.length > 0) {
                        this.store.save(selector, selector, aiCandidates, {
                            lastSeen: this.DateTime(new Date()),
                            aiGenerated: true,
                        });
                    }
                }

                return locator;

            } catch {
                //  Original failed → try stored candidates
                const entry = this.store.get(selector);
                if (entry && entry.candidates.length > 0) {
                    for (const cand of entry.candidates) {
                        try {
                            const candidateLocator = getLocator(cand.selector);
                            const matches = await candidateLocator.count();

                            if (matches === 0) {
                                Logger.warn(`[SELF-HEALING] Skipping hallucinated candidate: ${cand.selector}`);
                                continue;
                            }

                            if (matches > 1) {
                                Logger.warn(`[SELF-HEALING] Candidate ${cand.selector} matched ${matches} elements. Skipping generic candidate.`);
                                continue;
                            }

                            await candidateLocator.first().waitFor({ state: "visible", timeout: 1500 });

                            this.store.save(selector, cand.selector, entry.candidates, {
                                lastSeen: this.DateTime(new Date()),
                                healed: true,
                            });

                            Logger.info(`[SELF-HEALING] Candidate healed: ${cand.selector}`);
                            return candidateLocator;

                        } catch {
                            Logger.warn(`[SELF-HEALING] Candidate failed: ${cand.selector}`);
                            continue;
                        }
                    }
                }

                throw new Error(`[SELF-HEALING] Could not heal selector (structure exists, candidates failed): ${selector}`);
            }
        }

        // =====================================================
        // Case 2: DOM structure changed (count === 0)
        // =====================================================
        Logger.warn(`[SELF-HEALING] No elements found for ${selector}. Regenerating from full DOM.`);

        try {
            // Use full page DOM so NextGenHeal(AI) sees replacements (<button> → <div>)
            const domSnippet = await this.page.content();

            let aiCandidates = await generateLocatorCandidatesWithAI(domSnippet, selector);

            Logger.debug("[SELF-HEALING] Raw NextGenHeal(AI) candidates (regeneration): " + aiCandidates.map(c => c.selector).join(", "));

            // Validate + dedup
            aiCandidates = await this.filterValidCandidates(aiCandidates);

            if (aiCandidates.length > 0) {
                for (const cand of aiCandidates) {
                    try {
                        const candidateLocator = getLocator(cand.selector);
                        const matches = await candidateLocator.count();

                        if (matches === 0) {
                            Logger.warn(`[SELF-HEALING] Skipping hallucinated regenerated candidate: ${cand.selector}`);
                            continue;
                        }

                        if (matches > 1) {
                            Logger.warn(`[SELF-HEALING] Regenerated candidate ${cand.selector} matched ${matches} elements. Skipping generic candidate.`);
                            continue;
                        }

                        await candidateLocator.first().waitFor({ state: "visible", timeout: 2000 });

                        this.store.save(selector, cand.selector, aiCandidates, {
                            regenerated: true,
                            lastSeen: this.DateTime(new Date()),
                        });

                        Logger.info(`[SELF-HEALING] Regenerated and healed using: ${cand.selector}`);
                        return candidateLocator;

                    } catch {
                        Logger.warn(`[SELF-HEALING] Regenerated candidate failed: ${cand.selector}`);
                        continue;
                    }
                }
            }
        } catch (err) {
            Logger.error("[SELF-HEALING] NextGenHeal(AI) regeneration failed: " + err);
        }

        throw new Error(`[SELF-HEALING] Could not heal locator (DOM changed): ${selector}`);
    }



    // =====================================================
    // Helper: Validate & Deduplicate only (no re-scoring)
    // =====================================================
    private async filterValidCandidates(candidates: any[]) {
        const validated: any[] = [];

        const getLocator = (sel: string) =>
            sel.startsWith("/") || sel.startsWith("//")
                ? this.page.locator(`xpath=${sel}`)
                : this.page.locator(sel);

        for (const cand of candidates) {
            try {
                const candidateLocator = getLocator(cand.selector);
                const count = await candidateLocator.count();

                if (count > 0) {
                    validated.push(cand);
                } else {
                    Logger.warn(`[SELF-HEALING] Dropping hallucinated candidate (not found in DOM): ${cand.selector}`);
                }
            } catch {
                Logger.warn(`[SELF-HEALING] Dropping invalid selector syntax: ${cand.selector}`);
            }
        }

        // Deduplicate by selector string
        const unique = new Map<string, any>();
        for (const cand of validated) {
            unique.set(cand.selector, cand);
        }

        return Array.from(unique.values());
    }
    // @ts-ignore

DateTime(date: Date): string {
        const mm = String(date.getMonth() + 1).padStart(2, "0");
        const dd = String(date.getDate()).padStart(2, "0");
        const yyyy = date.getFullYear();

        const hh = String(date.getHours()).padStart(2, "0");
        const min = String(date.getMinutes()).padStart(2, "0");
        const ss = String(date.getSeconds()).padStart(2, "0");

        return `${mm}/${dd}/${yyyy} ${hh}:${min}:${ss}`;
    }

}
