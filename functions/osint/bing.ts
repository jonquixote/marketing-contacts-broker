import { SearchTarget, ScrapedProfile } from './corporate';

/**
 * Engine A (Alternative 2): Bing
 * Bing is often less aggressive than Google/DDG if the User-Agent is correct.
 */
export async function runBingSearch(target: SearchTarget, page: any): Promise<ScrapedProfile[]> {
    const { role, company } = target;
    // Query: site:linkedin.com/in "Role" "Company"
    const query = `site:linkedin.com/in "${role}" "${company}"`;
    const searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(query)}`;

    console.log(`[Engine A - Bing] Executing Search: ${query}`);

    // Bing requires very specific headers to look like Edge
    await page.setExtraHTTPHeaders({
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Microsoft Edge";v="120"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"'
    });

    try {
        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });

        // Check for captcha
        if (page.url().includes('challenge')) {
            throw new Error('Bing CAPTCHA detected');
        }

        const profiles = await page.evaluate(() => {
            const results: any[] = [];
            // Fallback: Scan ALL links on the page
            const links = Array.from(document.links);

            links.forEach((link) => {
                const url = link.href;

                if (url.includes('linkedin.com/in/')) {
                    let titleText = link.innerText;

                    // Try to find a parent header
                    const parentHeader = link.closest('h2') || link.closest('h3');
                    if (parentHeader) {
                        titleText = parentHeader.innerText;
                    }

                    if (titleText && !url.includes('/dir/') && !url.includes('/jobs/')) {
                        const parts = titleText.split(' - ');
                        const name = parts[0] || 'Unknown';
                        const headline = parts.slice(1).join(' - ').replace('| LinkedIn', '').replace('...', '').trim();

                        // Deduplicate
                        if (!results.find(r => r.linkedinUrl === url)) {
                            results.push({
                                name,
                                headline,
                                linkedinUrl: url
                            });
                        }
                    }
                }
            });
            return results;
        });
        console.log(`[Engine A - Bing] Found ${profiles.length} profiles.`);
        return profiles;

    } catch (error) {
        console.error(`[Engine A - Bing] Failed: ${error}`);
        return [];
    }
}
