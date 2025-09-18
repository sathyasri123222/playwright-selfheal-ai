import fs from "fs";
import path from "path";
import { Candidate } from "./HealingStrategies";

const STORE_PATH = path.join(process.cwd(), "healingStore.json");

export interface HealingEntry {
    original: string;
    healed: string | null;
    candidates: Candidate[];
    meta: Record<string, any>;
    updatedAt: string;   // added timestamp
}

export class LocatorStore {
    private store: Record<string, HealingEntry> = {};

    constructor() {
        if (fs.existsSync(STORE_PATH)) {
            this.store = JSON.parse(fs.readFileSync(STORE_PATH, "utf-8"));
        }
        this.cleanupStale(); //auto-clean stale entries on load
    }

    get(selector: string): HealingEntry | undefined {
        return this.store[selector];
    }

    save(
        original: string,
        healed: string | null,
        candidates: Candidate[],
        meta: Record<string, any> = {}
    ) {
        this.store[original] = {
            original,
            healed,
            candidates,
            meta,
            updatedAt: new Date().toISOString(), //update timestamp
        };
        this.persist();
        this.cleanupStale(); //auto-clean on save
    }

    update(
        stableKey: string,
        original: string,
        healed: string | null,
        candidates: Candidate[],
        meta: Record<string, any> = {}
    ) {
        this.store[stableKey] = {
            original,
            healed,
            candidates,
            meta,
            updatedAt: new Date().toISOString(), //update timestamp
        };
        this.persist();
        this.cleanupStale(); //auto-clean on update
    }

    list(): Record<string, HealingEntry> {
        return this.store;
    }

    /**
     * Remove entries not updated in last X days
     */
    cleanupStale(days = 30) {
        const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
        let removed = 0;
        for (const [key, entry] of Object.entries(this.store)) {
            if (new Date(entry.updatedAt).getTime() < cutoff) {
                delete this.store[key];
                removed++;
            }
        }
        if (removed > 0) {
            console.log(`[LocatorStore] Cleaned up ${removed} stale entries`);
            this.persist();
        }
    }

    private persist() {
        fs.writeFileSync(STORE_PATH, JSON.stringify(this.store, null, 2));
    }
}
