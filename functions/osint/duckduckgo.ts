import { SearchTarget, ScrapedProfile } from './corporate';

/**
 * Engine A (Alternative 1): DuckDuckGo
 * often blocks datacenter IPs immediately.
 */
export async function runDuckDuckGoSearch(target: SearchTarget, page: any): Promise<ScrapedProfile[]> {
    const { role, company } = target;
    // Dork: site:linkedin.com/in "Role" "Company"
    const query = `site:linkedin.com/in "${role}" "${company}"`;
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

    console.log(`[Engine A - DDG] Executing Search: ${query}`);

    try {
        await page.goto(searchUrl, { waitUntil: 'domcontentloaded' });

        // DDG HTML selectors
        // Results are usually in .result
        const profiles = await page.evaluate(() => {
            const results: any[] = [];
            const items = document.querySelectorAll('.result');

            items.forEach((item) => {
                const titleEl = item.querySelector('.result__title .result__a');
                const snippetEl = item.querySelector('.result__snippet');

                if (titleEl) {
                    const titleText = (titleEl as HTMLElement).innerText;
                    const url = (titleEl as HTMLAnchorElement).href;

                    if (url.includes('linkedin.com/in/')) {
                        // Parse Title: "Name - Title - Company | LinkedIn"
                        const parts = titleText.split(' - ');
                        const name = parts[0] || 'Unknown';
                        const headline = parts.slice(1).join(' - ').replace('| LinkedIn', '').trim();

                        results.push({
                            name,
                            headline,
                            linkedinUrl: url
                        });
                    }
                }
            });
            return results;
        });

        console.log(`[Engine A - DDG] Found ${profiles.length} profiles.`);
        return profiles;

    } catch (error) {
        console.error(`[Engine A - DDG] Failed: ${error}`);
        return [];
    }
}
