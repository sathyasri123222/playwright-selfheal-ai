import { OpenAI } from "openai";
import { Logger } from "./Logger";
import {config} from "../../config";

export interface Candidate {
    type: string;
    selector: string;
    score: number;
}
// @ts-ignore
let client: OpenAI | null = null;

function getClient(): OpenAI {
    if (!config.AI_ENABLED) {
        throw new Error("[SELF-HEALING] NextGenHeal(AI) is disabled but NextGenHeal(AI) code was called");
    }
    if (!process.env.OPENAI_API_KEY) {
        throw new Error("[SELF-HEALING] OPENAI_API_KEY missing");
    }
    if (!client) {
        client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        Logger.info("[SELF-HEALING] OpenAI client initialized");
    }
    return client;
}

/**
 * Generate locator candidates using NextGenHeal(AI) by analyzing DOM snippet
 */
export async function generateLocatorCandidatesWithAI(
    domSnippet: string,
    originalSelector: string
): Promise<Candidate[]> {
    const client = getClient();
    const prompt = `
You are a test automation assistant.
Given the DOM snippet below, generate robust alternative selectors
for the target element originally referenced by: ${originalSelector}.
If that exact element does not exist, generate selectors for the closest replacement element in the DOM.

Strategies to use:
- CSS by id, class, name, role, aria-label, data-*
- XPath absolute
- XPath relative
- XPath contains text / normalize-space
- Starts-with / ends-with for attributes
- Child-to-parent and sibling-based relationships
- Text-based selectors (with synonyms, e.g., "Login" -> "Sign In")

Prioritization rules for React apps:
1. data-testid, data-qa, data-cy, data-role (preferred in React/Tailwind/Semantic UI apps)
2. ARIA attributes (role, aria-label, aria-labelledby, aria-describedby)
3. Unique IDs
4. Stable class combinations (Semantic UI like "ui primary button")
5. Element + attribute (e.g., button[type='submit'])
6. Visible text (normalize-space text or contains text, plus synonyms)
7. Tailwind utility classes only as a last resort

 Additional healing rules:
- If the element's text content has changed (e.g. "Login" → "Update"), regenerate selectors using the new text while keeping the same element type and attributes.
- Always include selectors for the closest matching element in the DOM, even if it is a different tag than the original (e.g., replace <button> with <div>). Treat this as mandatory in addition to all other strategies.
- Ensure the final list includes at least one child-to-parent relationship selector (e.g., //div[@class='login-container']//button) in addition to others.
- Ensure the final list also includes at least one sibling-based relationship selector (e.g., //h2[normalize-space()='Login']/following-sibling::form//button) in addition to others.
- For every text-based selector, also generate at least one synonym variant if common synonyms exist (e.g., "Login" → "Sign In", "Submit" → "Proceed").
- Absolute XPath must always be included as the final fallback.
- The absolute XPath must always start at the root (//html//body) and end at the target element, for example: //html//body//div//form//div[1], in addition to others.

Return JSON array only, no explanations.
[
  {"type": "css-id", "selector": "#loginBtn", "score": 95},
  {"type": "xpath-text", "selector": "//div[normalize-space(text())='sign in']", "score": 85},
]

DOM:
${domSnippet}
`;

    // @ts-ignore
    const response = await client.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.2,
        messages: [
            {
                role: "system",
                content: "You are a test automation assistant. Always return a valid JSON array only, no explanations."
            },
            { role: "user", content: prompt }],
    });

    const raw = response.choices[0].message?.content?.trim() || "[]";

    // Remove code fences if NextGenHeal(AI) wrapped the response in ```json ... ```
    const cleaned = raw.replace(/```json|```/g, "").trim();

    try {
        return JSON.parse(cleaned) as Candidate[];
    } catch (e) {
        Logger.error(`[SELF-HEALING] Failed to parse AI locators: ${e}. Raw: ${raw}`);
        return [];
    }
}
