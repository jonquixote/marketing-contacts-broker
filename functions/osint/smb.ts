import { getBrowser, createStealthPage } from '../utils/browser';
import { searchYelp } from './yelp';
import { searchPlaces } from './google_places';

export interface SmbSearchTarget {
    businessType: string;
    location: string;
}

export interface SmbProfile {
    name: string;
    address: string;
    website?: string;
    phone?: string;
    source?: string;
    rating?: number;
    reviewCount?: number;
}

/**
 * Engine B: SMB Intelligence (Multi-Source)
 * 
 * Search Priority:
 * 1. Yelp Fusion API (if YELP_API_KEY exists) - Most reliable
 * 2. Google Places API (uses GOOGLE_API_KEY) - Good fallback  
 * 3. YellowPages Scraping (Stealth) - Free but blocked on Vercel
 * 4. Bing Local Search - Last resort
 */
export async function runSmbSearch(target: SmbSearchTarget, _unusedPage?: any): Promise<SmbProfile[]> {
    const { businessType, location } = target;
    console.log(`[Engine B - SMB] Starting multi-source search: "${businessType}" in "${location}"`);

    // 1. Try Yelp API first (most reliable)
    if (process.env.YELP_API_KEY) {
        try {
            console.log('[Engine B] Trying Yelp Fusion API...');
            const yelpResults = await searchYelp(businessType, location, 20);
            if (yelpResults.length > 0) {
                console.log(`[Engine B] Yelp returned ${yelpResults.length} results`);
                return yelpResults.map(r => ({ ...r, source: 'Yelp' }));
            }
        } catch (err: any) {
            console.warn(`[Engine B] Yelp failed: ${err.message}`);
        }
    }

    // 2. Try Google Places API
    if (process.env.GOOGLE_API_KEY) {
        try {
            console.log('[Engine B] Trying Google Places API...');
            const query = `${businessType} in ${location}`;
            const placesResults = await searchPlaces(query, 20);
            if (placesResults.length > 0) {
                console.log(`[Engine B] Google Places returned ${placesResults.length} results`);
                return placesResults.map(r => ({ ...r, source: 'GooglePlaces' }));
            }
        } catch (err: any) {
            console.warn(`[Engine B] Google Places failed: ${err.message}`);
        }
    }

    // 3. Fallback to YellowPages scraping (may fail on Vercel due to bot detection)
    console.log('[Engine B] API sources exhausted, trying YellowPages scraping...');
    const ypResults = await scrapeYellowPages(target);
    if (ypResults.length > 0) {
        return ypResults;
    }

    // 4. Last resort: Bing Local Search
    console.log('[Engine B] YellowPages failed, trying Bing Local Search...');
    const bingResults = await scrapeBingLocal(target);
    return bingResults;
}

/**
 * YellowPages Scraper with enhanced stealth
 */
async function scrapeYellowPages(target: SmbSearchTarget): Promise<SmbProfile[]> {
    const { businessType, location } = target;
    const url = `https://www.yellowpages.com/search?search_terms=${encodeURIComponent(businessType)}&geo_location_terms=${encodeURIComponent(location)}`;

    let browser;
    try {
        browser = await getBrowser();
        const page = await createStealthPage(browser);

        console.log(`[Engine B - YP Stealth] Navigating to: ${url}`);
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

        const pageTitle = await page.title();
        const contentLen = (await page.content()).length;
        console.log(`[Engine B - YP Stealth] Page Loaded. Title: "${pageTitle}", HTML Length: ${contentLen}`);

        // Check for bot detection indicators
        const bodyText = await page.evaluate(() => document.body?.innerText?.substring(0, 500) || '');
        if (bodyText.includes('verify you are a human') || bodyText.includes('Access Denied') || bodyText.includes('blocked')) {
            console.warn('[Engine B - YP Stealth] Bot detection triggered');
            return [];
        }

        const results = await page.evaluate(() => {
            const items = document.querySelectorAll('.result');
            const data: any[] = [];

            items.forEach((item) => {
                const name = item.querySelector('.business-name')?.textContent;
                const phone = item.querySelector('.phones')?.textContent;
                const address = item.querySelector('.street-address')?.textContent || '';
                const locality = item.querySelector('.locality')?.textContent || '';
                const websiteEl = item.querySelector('.links a.track-visit-website');
                const website = websiteEl?.getAttribute('href') || '';

                if (name) {
                    data.push({
                        name,
                        address: `${address}, ${locality}`.replace(/^, |, $/g, ''),
                        phone: phone || '',
                        website,
                        source: 'YellowPages'
                    });
                }
            });
            return data;
        });

        console.log(`[Engine B - YP Stealth] Found ${results.length} businesses`);
        return results;

    } catch (error: any) {
        console.error(`[Engine B - YP Stealth] Failed: ${error.message}`);
        return [];
    } finally {
        if (browser) await browser.close();
    }
}

/**
 * Bing Local Search Scraper
 */
async function scrapeBingLocal(target: SmbSearchTarget): Promise<SmbProfile[]> {
    const { businessType, location } = target;
    const query = `${businessType} in ${location}`;
    const searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(query)}`;

    let browser;
    try {
        browser = await getBrowser();
        const page = await createStealthPage(browser);

        console.log(`[Engine B - Bing Local] Searching: ${query}`);
        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });

        const results = await page.evaluate(() => {
            const data: any[] = [];

            // Try to find local pack results first
            const localItems = document.querySelectorAll('.b_ans .b_entityTP, .b_ans .b_lm');
            localItems.forEach((item) => {
                const nameEl = item.querySelector('a, h3');
                if (nameEl) {
                    const name = (nameEl as HTMLElement).innerText;
                    // Try to extract phone from item
                    const itemText = (item as HTMLElement).innerText;
                    const phoneMatch = itemText.match(/(\(\d{3}\)\s?\d{3}-\d{4})|(\d{3}-\d{3}-\d{4})/);

                    data.push({
                        name,
                        address: '',
                        phone: phoneMatch ? phoneMatch[0] : '',
                        website: '',
                        source: 'BingLocal'
                    });
                }
            });

            // Also check organic results for business-like entries
            const organicItems = document.querySelectorAll('#b_results > li.b_algo');
            organicItems.forEach((item) => {
                const titleNode = item.querySelector('h2 a');
                if (titleNode) {
                    const name = (titleNode as HTMLElement).innerText;
                    const url = (titleNode as HTMLAnchorElement).href;

                    // Skip if already found or if it's a directory listing
                    if (data.find(d => d.name === name)) return;
                    if (url.includes('yellowpages.com') || url.includes('yelp.com')) return;

                    const snippetNode = item.querySelector('.b_caption p');
                    const snippet = snippetNode ? (snippetNode as HTMLElement).innerText : '';
                    const phoneMatch = snippet.match(/(\(\d{3}\)\s?\d{3}-\d{4})|(\d{3}-\d{3}-\d{4})/);

                    data.push({
                        name: name.split(' - ')[0].split(' |')[0], // Clean up title
                        address: '',
                        phone: phoneMatch ? phoneMatch[0] : '',
                        website: url,
                        source: 'BingOrganic'
                    });
                }
            });

            return data.slice(0, 20); // Limit results
        });

        console.log(`[Engine B - Bing Local] Found ${results.length} businesses`);
        return results;

    } catch (error: any) {
        console.error(`[Engine B - Bing Local] Failed: ${error.message}`);
        return [];
    } finally {
        if (browser) await browser.close();
    }
}

// Compatibility export
export async function runYellowPagesSearch(target: SmbSearchTarget, _page: any) {
    return runSmbSearch(target);
}

