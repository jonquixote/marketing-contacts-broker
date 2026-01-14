import { getBrowser } from '../utils/browser';

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

    let browser;
    try {
        browser = await getBrowser();
        const page = await browser.newPage();

        // Manual Stealth Headers
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        console.log(`[Engine B - YP Stealth] Navigating to: ${url}`);
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

        const pageTitle = await page.title();
        const contentLen = (await page.content()).length;
        console.log(`[Engine B - YP Stealth] Page Loaded. Title: "${pageTitle}", HTML Length: ${contentLen}`);

        const results = await page.evaluate(() => {
            const items = document.querySelectorAll('.result');
            console.log(`[Engine B - YP Stealth] In-Browser: Found ${items.length} .result items`);

            const data: any[] = [];
            items.forEach((item, index) => {
                const name = item.querySelector('.business-name')?.textContent;
                const phone = item.querySelector('.phones')?.textContent;
                const address = item.querySelector('.street-address')?.textContent || '';
                const locality = item.querySelector('.locality')?.textContent || '';
                const website = item.querySelector('.links a.track-visit-website')?.getAttribute('href') || '';

                if (!name) console.log(`[Engine B - YP Stealth] Item ${index} missing name`);

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

        console.log(`[Engine B - YP Stealth] Final Results: ${results.length} businesses.`);
        return results;

    } catch (error) {
        console.error(`[Engine B - YP Stealth] Failed: ${(error as any).message}`);
        // Log stack trace if available
        if ((error as any).stack) console.error((error as any).stack);
        return [];
    } finally {
        if (browser) await browser.close();
    }
}

// Keep this for compatibility if needed, but we use the one above
export async function runYellowPagesSearch(target: SmbSearchTarget, _page: any) {
    return runSmbSearch(target);
}
