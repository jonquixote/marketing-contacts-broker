import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';

/**
 * Browser utility with enhanced stealth configuration
 * Designed to minimize bot detection on Vercel serverless
 */

// Randomize viewport to avoid fingerprinting
function getRandomViewport() {
    const widths = [1280, 1366, 1440, 1536, 1600, 1920];
    const heights = [720, 768, 800, 864, 900, 1080];
    return {
        width: widths[Math.floor(Math.random() * widths.length)],
        height: heights[Math.floor(Math.random() * heights.length)]
    };
}

// Common user agents that look legitimate
const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15'
];

function getRandomUserAgent() {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

// Enhanced stealth arguments
const STEALTH_ARGS = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-accelerated-2d-canvas',
    '--no-first-run',
    '--no-zygote',
    '--disable-gpu',
    // Critical for avoiding bot detection
    '--disable-blink-features=AutomationControlled',
    '--disable-features=IsolateOrigins,site-per-process',
    // Fingerprint randomization
    '--disable-web-security',
    '--disable-features=VizDisplayCompositor',
    // Performance for serverless
    '--single-process',
    '--disable-background-networking',
    '--disable-default-apps',
    '--disable-extensions',
    '--disable-sync',
    '--disable-translate',
    '--hide-scrollbars',
    '--metrics-recording-only',
    '--mute-audio',
    '--no-default-browser-check'
];

export async function getBrowser() {
    const isVercel = process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_VERSION;
    const viewport = getRandomViewport();

    if (isVercel) {
        console.log(`[Browser] Launching in Vercel/Lambda (Stealth Enhanced) - Viewport: ${viewport.width}x${viewport.height}`);
        // @ts-ignore
        const executablePath = await chromium.executablePath();

        const browser = await puppeteer.launch({
            args: [...chromium.args, ...STEALTH_ARGS],
            defaultViewport: viewport,
            executablePath: executablePath,
            headless: (chromium as any).headless,
            ignoreHTTPSErrors: true,
        } as any);

        return browser;
    }

    console.log(`[Browser] Launching in Local environment - Viewport: ${viewport.width}x${viewport.height}`);
    try {
        return puppeteer.launch({
            channel: 'chrome',
            headless: true,
            args: STEALTH_ARGS,
            defaultViewport: viewport
        });
    } catch (e) {
        return puppeteer.launch({
            executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            headless: true,
            args: STEALTH_ARGS.filter(a => a !== '--single-process'), // single-process can cause issues locally
            defaultViewport: viewport
        });
    }
}

/**
 * Apply stealth settings to a page
 * Call this after creating a new page to maximize stealth
 */
export async function applyStealthToPage(page: any) {
    const userAgent = getRandomUserAgent();

    // Set user agent
    await page.setUserAgent(userAgent);

    // Set extra headers that real browsers send
    await page.setExtraHTTPHeaders({
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1'
    });

    // Override navigator properties to hide automation
    await page.evaluateOnNewDocument(() => {
        // Remove webdriver flag
        Object.defineProperty(navigator, 'webdriver', {
            get: () => undefined
        });

        // Override plugins to look like a real browser
        Object.defineProperty(navigator, 'plugins', {
            get: () => [
                { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer' },
                { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai' },
                { name: 'Native Client', filename: 'internal-nacl-plugin' }
            ]
        });

        // Override languages
        Object.defineProperty(navigator, 'languages', {
            get: () => ['en-US', 'en']
        });

        // Mock chrome runtime
        (window as any).chrome = {
            runtime: {},
            loadTimes: function () { },
            csi: function () { },
            app: {}
        };
    });

    console.log(`[Browser] Applied stealth settings with UA: ${userAgent.substring(0, 50)}...`);
    return page;
}

/**
 * Create a stealthed page ready for scraping
 */
export async function createStealthPage(browser: any) {
    const page = await browser.newPage();
    await applyStealthToPage(page);
    return page;
}

