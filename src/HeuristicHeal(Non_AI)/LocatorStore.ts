import { Candidate } from "./HealingStrategies";
// @ts-ignore
import * as fs from "fs";
// @ts-ignore
import * as path from "path";

export interface LocatorMeta {
    tag: string;
    text?: string;
    attributes: Record<string, string>;
    ariaLabel?: string;
    role?: string;
    parent?: { tag: string; id?: string; class?: string };
}

export interface LocatorRecord {
    original: string;
    healed?: string;
    candidates: Candidate[];
    meta: LocatorMeta;
    updatedAt: string;
}

export class LocatorStore {
    private store: Record<string, LocatorRecord> = {};
    private filePath: string;

    constructor(fileName = "locatorStore.json", directory: string = process.cwd()) {
        this.filePath = path.resolve(directory, fileName);

        if (fs.existsSync(this.filePath)) {
            try {
                this.store = JSON.parse(fs.readFileSync(this.filePath, "utf-8"));
            } catch {
                this.store = {};
            }
        }

        this.cleanupStale(); //auto-clean on load
    }

    /**
     * Save or update a locator record in the store
     * - Skips saving if healed element not present in DOM
     * - Stores only working candidates (validated in DOM)
     */
    async saveRecord(
        page: any,
        original: string,
        healed: string,
        candidates: Candidate[],
        meta: LocatorMeta
    ) {
        const healedCount = await page.locator(healed).count();
        if (healedCount === 0) {
            console.warn(`[LocatorStore] Skipping save: element '${healed}' not found in DOM`);
            return;
        }

        // Filter only working locators
        const workingCandidates: Candidate[] = [];
        for (const c of candidates) {
            try {
                const count = await page.locator(c.selector).count();
                if (count > 0) {
                    workingCandidates.push(c);
                } else {
                    console.warn(`[LocatorStore] Skipped dead candidate: ${c.selector}`);
                }
            } catch {
                console.warn(`[LocatorStore] Invalid selector skipped: ${c.selector}`);
            }
        }

        this.store[original] = {
            original,
            healed,
            candidates: workingCandidates,
            meta,
            updatedAt: new Date().toISOString(), //update timestamp
        };

        fs.writeFileSync(this.filePath, JSON.stringify(this.store, null, 2), "utf-8");
        this.cleanupStale(); //auto-clean on save
    }

    /**
     * Get a record by original locator (with meta validation)
     */
    getRecord(original: string, currentMeta: LocatorMeta): LocatorRecord | undefined {
        const record = this.store[original];
        if (!record) return undefined;

        // Compare metadata
        const metaChanged =
            record.meta.tag !== currentMeta.tag ||
            record.meta.text !== currentMeta.text ||
            record.meta.ariaLabel !== currentMeta.ariaLabel ||
            record.meta.role !== currentMeta.role ||
            JSON.stringify(record.meta.attributes) !== JSON.stringify(currentMeta.attributes) ||
            JSON.stringify(record.meta.parent) !== JSON.stringify(currentMeta.parent);

        return metaChanged ? undefined : record;
    }

    /**
     * Get all records
     */
    getAll(): LocatorRecord[] {
        // @ts-ignore
        return Object.values(this.store);
    }

    /**
     * Mark candidate as failed
     */
    markCandidateFailed(original: string, selector: string) {
        const record = this.store[original];
        if (!record) return;

        record.candidates = record.candidates.map((c) =>
            c.selector === selector ? { ...c, failCount: (c as any).failCount + 1 || 1 } : c
        );

        fs.writeFileSync(this.filePath, JSON.stringify(this.store, null, 2), "utf-8");
    }

    /**
     * Remove stale records not updated in last X days
     */
    cleanupStale(days = 30) {
        const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
        let removed = 0;

        for (const [key, record] of Object.entries(this.store)) {
            if (new Date(record.updatedAt).getTime() < cutoff) {
                delete this.store[key];
                removed++;
            }
        }

        if (removed > 0) {
            console.log(`[LocatorStore] Cleaned up ${removed} stale records`);
            fs.writeFileSync(this.filePath, JSON.stringify(this.store, null, 2), "utf-8");
        }
    }
}
