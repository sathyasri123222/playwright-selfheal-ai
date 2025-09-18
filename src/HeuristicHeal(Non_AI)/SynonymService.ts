// SynonymService.ts
// Fetch synonyms dynamically from Datamuse API

// @ts-ignore
export async function getSynonyms(word: string): Promise<string[]> {
    try {
        const response = await fetch(
            `https://api.datamuse.com/words?ml=${encodeURIComponent(word)}`
        );
        if (!response.ok) {
            console.error(`[SynonymService] API error: ${response.statusText}`);
            return [];
        }
        const data = await response.json();
        return data.map((item: any) => item.word);
    } catch (err) {
        console.error(`[SynonymService] Failed for word "${word}":`, err);
        return [];
    }
}



