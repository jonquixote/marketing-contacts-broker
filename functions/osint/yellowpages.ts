import { SmbSearchTarget, SmbProfile } from './smb';

/**
 * Engine B (Alternative): YellowPages
 * Scrapes YellowPages.com for local businesses.
 */
export async function runYellowPagesSearch(target: SmbSearchTarget, page: any): Promise<SmbProfile[]> {
    // Query format: https://www.yellowpages.com/search?search_terms=Digital+Agency&geo_location_terms=Austin%2C+TX
    const searchUrl = `https://www.yellowpages.com/search?search_terms=${encodeURIComponent(target.businessType)}&geo_location_terms=${encodeURIComponent(target.location)}`;

    console.log(`[Engine B - YP] Executing Search: ${searchUrl}`);

    try {
        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

        const results = await page.evaluate(() => {
            const items = document.querySelectorAll('.result');
            const data: any[] = [];

            items.forEach((item) => {
                const nameEl = item.querySelector('.business-name');
                const phoneEl = item.querySelector('.phones');
                const addressEl = item.querySelector('.street-address');
                const localityEl = item.querySelector('.locality');
                const websiteEl = item.querySelector('.links .track-visit-website');

                if (nameEl) {
                    const name = (nameEl as HTMLElement).innerText;
                    const phone = phoneEl ? (phoneEl as HTMLElement).innerText : '';
                    const street = addressEl ? (addressEl as HTMLElement).innerText : '';
                    const locality = localityEl ? (localityEl as HTMLElement).innerText : '';
                    const website = websiteEl ? (websiteEl as HTMLAnchorElement).href : '';

                    data.push({
                        name,
                        address: `${street}, ${locality}`,
                        phone,
                        website
                    });
                }
            });
            return data;
        });

        console.log(`[Engine B - YP] Found ${results.length} businesses.`);
        return results;

    } catch (error) {
        console.error(`[Engine B - YP] Failed: ${error}`);
        return [];
    }
}
