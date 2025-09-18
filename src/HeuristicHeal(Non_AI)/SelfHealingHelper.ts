import { Page } from "@playwright/test";
import { LocatorStore, LocatorMeta } from "./LocatorStore";
import { generateLocatorCandidates, heuristicScore, Candidate } from "./HealingStrategies";
import { Logger } from "./Logger";

// Simple string similarity (0–1)
function stringSimilarity(a: string, b: string): number {
    if (!a || !b) return 0;
    a = a.toLowerCase();
    b = b.toLowerCase();
    if (a === b) return 1;

    let matches = 0;
    const len = Math.min(a.length, b.length);
    for (let i = 0; i < len; i++) {
        if (a[i] === b[i]) matches++;
    }
    return matches / Math.max(a.length, b.length);
}

export class SelfHealingHelper {
    private store: LocatorStore;

    constructor(private page: Page, storeFile = "healingStore.json", storeDir?: string) {
        this.store = new LocatorStore(storeFile, storeDir);
    }

    /**
     * Main entry point for finding elements with self-healing
     */
    async find(selector: string) {
        // 1. Try original selector directly
        const originalLoc = this.page.locator(selector);
        if (await originalLoc.count() > 0) {
            Logger.info(`Original locator still works: ${selector}`);

            const meta = await this.getElementMeta(selector);
            if (meta) {
                const candidates = await generateLocatorCandidates(this.page, selector);
                await this.store.saveRecord(this.page, selector, selector, candidates, meta);
            }
            return originalLoc;
        }

        // 2. JSON fallback
        Logger.info(`Fallback: checking JSON for '${selector}'`);
        const stored = this.store.getAll().find((r) => r.original === selector);

        if (stored) {
            // Try current meta from DOM (if element still partially findable)
            const currentMeta = await this.getElementMeta(selector);

            if (currentMeta && this.store.getRecord(selector, currentMeta)) {
                // ✅ Meta matched → reuse JSON candidates
                Logger.info(`[Meta matched ✅] Using JSON candidates for: ${selector}`);
                for (const candidate of stored.candidates) {
                    const loc = this.page.locator(candidate.selector);
                    if (await loc.count() === 1) {
                        const candidateText = await loc.first().innerText().catch(() => "");
                        const sim = stringSimilarity(stored.meta.text || "", candidateText);
                        const baseScore = heuristicScore(candidate, stored.meta);
                        const combinedScore = baseScore + sim * 100;
                        Logger.info(
                            `[Recovered ✅] '${selector}' → '${candidate.selector}' (score=${combinedScore})`
                        );
                        return loc;
                    }
                }
            } else {
                // ❌ Meta changed or element missing → regenerate using stored meta
                Logger.info(`[Meta changed 🔄] Refreshing with stored meta for '${selector}'`);
                return await this.refreshRecordWithStoredMeta(selector, stored.meta);
            }
        }

        // 3. Healing from scratch
        Logger.info(`Healing required for: ${selector}`);
        return await this.refreshRecord(selector);
    }

    /**
     * Refresh candidates from DOM using the same selector
     */
    private async refreshRecord(selector: string, newMeta?: LocatorMeta) {
        Logger.info(`[Refreshing 🔄] Regenerating candidates for: ${selector}`);

        const candidates: Candidate[] = await generateLocatorCandidates(this.page, selector);

        for (const candidate of candidates) {
            const loc = this.page.locator(candidate.selector);
            if (await loc.count() === 1) {
                Logger.info(`[Healed ✅] '${selector}' → '${candidate.selector}'`);
                const meta = newMeta || (await this.getElementMeta(candidate.selector));
                if (meta) {
                    await this.store.saveRecord(this.page, selector, candidate.selector, candidates, meta);
                }
                return loc;
            }
        }

        throw new Error(`[SELF-HEALING ❌] Could not find locator: ${selector}`);
    }

    /**
     * Refresh candidates using stored metadata
     */
    private async refreshRecordWithStoredMeta(selector: string, storedMeta: LocatorMeta) {
        Logger.info(`[Refreshing 🔄] Using stored meta for: ${selector}`);

        // Build parent selector
        const parentSel = storedMeta.parent?.id
            ? `#${storedMeta.parent.id}`
            : storedMeta.parent?.class
                ? `.${storedMeta.parent.class.split(" ")[0]}`
                : storedMeta.parent?.tag || "";

        // Prefer stored tag, but fallback to scanning all children if tag changed
        let altSelector = parentSel ? `${parentSel} ${storedMeta.tag}` : storedMeta.tag;

        let candidates: Candidate[] = await generateLocatorCandidates(this.page, altSelector);

        if (!candidates || candidates.length === 0) {
            Logger.info(`[Fallback 🔍] Tag mismatch → scanning all children of ${parentSel}`);
            const childHandles = await this.page.$$(parentSel + " *");
            for (const handle of childHandles) {
                const meta = await this.page.evaluate((el) => {
                    return {
                        tag: el.tagName.toLowerCase(),
                        text: el.textContent?.trim() || "",
                        attributes: Object.fromEntries(
                            Array.from(el.getAttributeNames()).map((n) => [n, el.getAttribute(n) || ""])
                        ),
                        ariaLabel: el.getAttribute("aria-label") || "",
                        role: el.getAttribute("role") || "",
                    };
                }, handle);

                if (
                    (storedMeta.text && meta.text && meta.text.toLowerCase().includes(storedMeta.text.toLowerCase())) ||
                    (storedMeta.ariaLabel && meta.ariaLabel === storedMeta.ariaLabel) ||
                    (storedMeta.role && meta.role === storedMeta.role)
                ) {
                    altSelector = `${parentSel} ${meta.tag}`;
                    Logger.info(`[Fallback 🔍] Found possible replacement tag → ${altSelector}`);
                    candidates = await generateLocatorCandidates(this.page, altSelector);
                    if (candidates && candidates.length > 0) break;
                }
            }
        }

        // Pick first working candidate
        for (const candidate of candidates) {
            const loc = this.page.locator(candidate.selector);
            if (await loc.count() === 1) {
                Logger.info(`[Healed ✅] '${selector}' → '${candidate.selector}'`);
                const meta = await this.getElementMeta(candidate.selector);
                if (meta) {
                    await this.store.saveRecord(this.page, selector, candidate.selector, candidates, meta);
                }
                return loc;
            }
        }

        throw new Error(`[SELF-HEALING ❌] Could not find locator using stored meta: ${selector}`);
    }

    /**
     * Capture element metadata for store
     */
    private async getElementMeta(selector: string): Promise<LocatorMeta | null> {
        const elementHandle = await this.page.$(selector);
        if (!elementHandle) return null;

        return await this.page.evaluate((el) => {
            const attrs: Record<string, string> = {};
            for (const attr of el.getAttributeNames()) {
                attrs[attr] = el.getAttribute(attr) || "";
            }

            const parent = el.parentElement
                ? {
                    tag: el.parentElement.tagName.toLowerCase(),
                    id: el.parentElement.getAttribute("id") || undefined,
                    class: el.parentElement.getAttribute("class") || undefined,
                }
                : undefined;

            return {
                tag: el.tagName.toLowerCase(),
                text: el.textContent?.trim() || "",
                attributes: attrs,
                ariaLabel: el.getAttribute("aria-label") || "",
                role: el.getAttribute("role") || "",
                parent,
            };
        }, elementHandle);
    }
}
