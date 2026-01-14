import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

export interface SmbSearchTarget {
    businessType: string;
    location: string;
}

export interface SmbProfile {
    name: string;
    address: string;
    website?: string;
    phone?: string;
}

/**
 * Engine B: SMB Intelligence (YellowPages via Puppeteer Stealth)
 * Proven to work where Google Maps fails.
 */
export async function runSmbSearch(target: SmbSearchTarget, _unusedPage?: any): Promise<SmbProfile[]> {
    const { businessType, location } = target;
    const url = `https://www.yellowpages.com/search?search_terms=${encodeURIComponent(businessType)}&geo_location_terms=${encodeURIComponent(location)}`;

    console.log(`[Engine B - YP Stealth] Executing Search: ${url}`);

    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        const page = await browser.newPage();
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

        const results = await page.evaluate(() => {
            const items = document.querySelectorAll('.result');
            const data: any[] = [];
            items.forEach(item => {
                const name = item.querySelector('.business-name')?.textContent;
                const phone = item.querySelector('.phones')?.textContent;
                const address = item.querySelector('.street-address')?.textContent || '';
                const locality = item.querySelector('.locality')?.textContent || '';
                const website = item.querySelector('.links a.track-visit-website')?.getAttribute('href') || '';

                if (name) {
                    data.push({
                        name,
                        address: `${address}, ${locality}`,
                        phone: phone || '',
                        website
                    });
                }
            });
            return data;
        });

        console.log(`[Engine B - YP Stealth] Found ${results.length} businesses.`);
        return results;

    } catch (error) {
        console.error(`[Engine B - YP Stealth] Failed: ${(error as any).message}`);
        return [];
    } finally {
        await browser.close();
    }
}

// Keep this for compatibility if needed, but we use the one above
export async function runYellowPagesSearch(target: SmbSearchTarget, _page: any) {
    return runSmbSearch(target);
}
