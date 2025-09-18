import { Page } from "@playwright/test";
import { getSynonyms } from "./SynonymService";

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

export interface Candidate {
    type: string;
    selector: string;
    score?: number;
    updatedAt?: string;
}

export interface HealingConfig {
    enableLogs?: boolean;
}

let LOG_ENABLED = true;
export function configureHealing(config: HealingConfig) {
    LOG_ENABLED = config.enableLogs ?? true;
}
function log(msg: string) {
    if (LOG_ENABLED) console.log(msg);
}

// 🔹 Detect volatile classes
function isVolatileClass(cls: string): boolean {
    return (
        cls.length <= 12 &&
        /(active|loading|disabled|selected|focus|error|open|show)/i.test(cls)
    );
}

// 🔹 Scoring function
export function heuristicScore(candidate: Candidate, meta: any): number {
    const sel = candidate.selector;
    const attrs = meta.attributes || {};

    if (sel.includes("#") || sel.includes("aria-label") || /@id=/.test(sel)) {
        const id = attrs["id"] || "";
        if (id && /^[a-zA-Z]+[a-zA-Z0-9_-]*$/.test(id) && id.length < 15) return 95;
        return 80;
    }
    if (sel.includes("normalize-space(text())")) return 90;
    if (sel.includes("contains(normalize-space")) return 75;
    if (sel.includes("[") && sel.includes("=")) return 70;
    if (sel.includes(" and @")) return 80;
    if (sel.includes("starts-with(") || sel.includes(" or @")) return 65;
    if (candidate.type.includes("class")) return 70;
    if (sel.includes("nth-child") || sel.includes("sibling") || sel.includes("ancestor") || sel.includes("descendant")) return 50;
    if (candidate.type.includes("synonym")) return 35;
    if (candidate.type.includes("absolute-xpath")) return 10;
    return 50;
}

// --- Validate uniqueness
async function validateUnique(page: Page, selector: string): Promise<number> {
    try {
        return await page.locator(selector).count();
    } catch {
        return 0;
    }
}

async function addIfUnique(page: Page, candidates: Candidate[], type: string, selector: string) {
    const count = await validateUnique(page, selector);
    if (count === 1) {
        log(`[✅ KEEP] ${type} → ${selector}`);
        candidates.push({ type, selector });
    } else if (count > 1) {
        log(`[❌ DISCARD multiple=${count}] ${type} → ${selector}`);
    } else {
        log(`[❌ DISCARD not found] ${type} → ${selector}`);
    }
}

export async function generateLocatorCandidates(
    page: Page,
    originalSelector: string
): Promise<Candidate[]> {
    const candidates: Candidate[] = [];
    let elementHandle = await page.$(originalSelector);

    // 🔹 If original not found → safe fallback
    if (!elementHandle) {
        log(`[Healing] '${originalSelector}' not found. Trying safe fallback...`);

        // Get original text if present
        const origTextMatch = originalSelector.match(/text\(\)\s*=\s*['"]([^'"]+)['"]/);
        const origText = origTextMatch ? origTextMatch[1].toLowerCase() : "";

        // Capture parent info of original selector (by parsing key parts)
        let expectedParentId = "";
        let expectedParentClass = "";
        const parentMatch = originalSelector.match(/\/\/(\w+)\[@id=['"]([^'"]+)['"]\]/);
        if (parentMatch) expectedParentId = parentMatch[2];

        const tagMatch = originalSelector.match(/\/\/(\w+)/);
        const fallbackTag = tagMatch ? tagMatch[1] : "button";

        const all = await page.$$(fallbackTag);
        let bestHandle: any = null;
        let bestScore = 0;

        for (const el of all) {
            const txt = (await el.textContent())?.trim().toLowerCase() || "";
            if (!txt) continue;

            let simScore = origText ? stringSimilarity(origText, txt) : 0;

            // Boost for submit buttons
            const attrs = await el.evaluate((node: Element) => {
                const a: Record<string, string> = {};
                for (const n of node.getAttributeNames()) {
                    a[n] = node.getAttribute(n) || "";
                }
                return a;
            });
            if (attrs["type"] === "submit") simScore += 0.3;

            // Parent check
            const parentId = await el.evaluate((node: Element) => node.parentElement?.id || "");
            const parentClass = await el.evaluate((node: Element) => (node.parentElement as HTMLElement)?.className || "");

            if (expectedParentId && parentId === expectedParentId) simScore += 0.4;
            if (expectedParentClass && parentClass.includes(expectedParentClass)) simScore += 0.3;

            if (simScore > bestScore) {
                bestScore = simScore;
                bestHandle = el;
            }
        }

        if (bestScore >= 0.6 && bestHandle) {
            log(`[Healing] Fallback chose element with score ${bestScore}`);
            elementHandle = bestHandle;
        } else {
            log(`[Healing] No valid replacement found for '${originalSelector}'`);
            return candidates; // fail safely
        }
    }

    // Extract metadata
    const meta = await page.evaluate((el: HTMLElement | SVGElement | null) => {
        if (!el) return { tag: "", text: "", attributes: {}, ariaLabel: "", role: "", parent: { id: "", class: "", tag: "" } };
        const attrs: Record<string, string> = {};
        for (const attr of el.getAttributeNames()) {
            attrs[attr] = el.getAttribute(attr) || "";
        }
        return {
            tag: el.tagName.toLowerCase(),
            text: el.textContent?.trim() || "",
            attributes: attrs,
            ariaLabel: el.getAttribute("aria-label") || "",
            role: el.getAttribute("role") || "",
            parent: {
                id: el.parentElement?.id || "",
                class: (el.parentElement as HTMLElement)?.className || "",
                tag: el.parentElement?.tagName.toLowerCase() || ""
            }
        };
    }, elementHandle);

    const { tag, text, attributes, ariaLabel, role } = meta;

    // --- ID
    if (attributes.id) {
        await addIfUnique(page, candidates, "css-id", `#${attributes.id}`);
        await addIfUnique(page, candidates, "css-tag-id", `${tag}#${attributes.id}`);
        await addIfUnique(page, candidates, "xpath-id", `xpath=//${tag}[@id="${attributes.id}"]`);
    }

    // --- Name
    if (attributes.name) {
        await addIfUnique(page, candidates, "css-name", `[name="${attributes.name}"]`);
        await addIfUnique(page, candidates, "css-tag-name", `${tag}[name="${attributes.name}"]`);
        await addIfUnique(page, candidates, "xpath-name", `xpath=//${tag}[@name="${attributes.name}"]`);
    }

    // --- Class
    if (attributes.class) {
        const classes = attributes.class
            .split(" ")
            .filter(Boolean)
            .filter((cls) => !isVolatileClass(cls));
        for (const cls of classes) {
            await addIfUnique(page, candidates, "css-class", `.${cls}`);
            await addIfUnique(page, candidates, "css-tag-class", `${tag}.${cls}`);
            await addIfUnique(page, candidates, "xpath-class", `xpath=//${tag}[contains(@class,"${cls}")]`);
        }
    }

    // --- Tag
    await addIfUnique(page, candidates, "css-tag", tag);

    // --- Other attributes
    const attrEntries = Object.entries(attributes)
        .filter(([k, v]) => v && v.length > 0 && v.length < 50 && !["class"].includes(k));

    for (const [key, value] of attrEntries) {
        await addIfUnique(page, candidates, "css-attr", `[${key}="${value}"]`);
        await addIfUnique(page, candidates, "css-tag-attr", `${tag}[${key}="${value}"]`);
        await addIfUnique(page, candidates, "xpath-attr", `xpath=//${tag}[@${key}="${value}"]`);
    }

    // --- Text & Synonyms
    if (text && text.length < 50) {
        await addIfUnique(page, candidates, "xpath-text", `xpath=//${tag}[normalize-space(text())="${text}"]`);
        await addIfUnique(page, candidates, "xpath-contains-text", `xpath=//${tag}[contains(normalize-space(.), "${text}")]`);

        const synonyms = await getSynonyms(text);
        const seen = new Set<string>();
        const limited = synonyms
            .map((s) => s.trim().toLowerCase())
            .filter((s) => s && !seen.has(s) && s !== text.toLowerCase() && seen.add(s))
            .slice(0, 3);

        for (const syn of limited) {
            log(`[ℹ️ SYNONYM] Keeping "${syn}"`);
            candidates.push({
                type: "xpath-synonym-text",
                selector: `xpath=//${tag}[normalize-space(text())="${syn}"]`,
                score: 35,
                updatedAt: new Date().toISOString()
            });
            candidates.push({
                type: "xpath-synonym-contains",
                selector: `xpath=//${tag}[contains(normalize-space(.), "${syn}")]`,
                score: 35,
                updatedAt: new Date().toISOString()
            });
        }
    }

    // --- Aria-label
    if (ariaLabel) {
        await addIfUnique(page, candidates, "css-aria", `[aria-label="${ariaLabel}"]`);
        await addIfUnique(page, candidates, "css-tag-aria", `${tag}[aria-label="${ariaLabel}"]`);
    }

    // --- Role
    if (role) {
        await addIfUnique(page, candidates, "css-role", `[role="${role}"]`);
        await addIfUnique(page, candidates, "css-tag-role", `${tag}[role="${role}"]`);
        await addIfUnique(page, candidates, "xpath-role", `xpath=//*[@role="${role}"]`);
    }

    // --- nth-child
    const nthChild = await page.evaluate((el: HTMLElement | SVGElement | null) => {
        if (!el || !el.parentElement) return null;
        const parent = el.parentElement;
        const children = Array.from(parent.children);
        const index = children.indexOf(el) + 1;
        return { parentTag: parent.tagName.toLowerCase(), index };
    }, elementHandle);

    if (nthChild) {
        await addIfUnique(page, candidates, "css-nth-child", `${nthChild.parentTag} > ${tag}:nth-child(${nthChild.index})`);
        await addIfUnique(page, candidates, "xpath-nth", `xpath=//${nthChild.parentTag}/${tag}[${nthChild.index}]`);
    }

    // --- Absolute XPath
    const absoluteXPath = await page.evaluate((el: HTMLElement | SVGElement | null) => {
        if (!el) return "";
        const getPath = (node: Element | null): string => {
            if (!node || node.nodeType !== Node.ELEMENT_NODE) return "";
            if (node === document.documentElement) return "/html";
            const siblings = Array.from(node.parentNode?.children || []).filter(
                n => n.nodeName === node.nodeName
            );
            const index = siblings.indexOf(node) + 1;
            return getPath(node.parentElement) + "/" + node.tagName.toLowerCase() + `[${index}]`;
        };
        return getPath(el);
    }, elementHandle);

    if (absoluteXPath) {
        await addIfUnique(page, candidates, "absolute-xpath", `xpath=${absoluteXPath}`);
    }

    // --- Final scoring
    const scored = candidates.map(c => ({
        ...c,
        score: c.score ?? heuristicScore(c, meta),
        updatedAt: new Date().toISOString()
    }));

    scored.sort((a, b) => b.score! - a.score!);
    log("=== Final Candidates ===");
    scored.forEach(c => log(`[Score ${c.score}] ${c.type} → ${c.selector}`));

    return scored;
}
