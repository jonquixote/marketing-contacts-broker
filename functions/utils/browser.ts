
import puppeteerCore from 'puppeteer-core';
import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import chromium from '@sparticuz/chromium';

// Configure stealth
puppeteerExtra.use(StealthPlugin());

export async function getBrowser() {
    const isVercel = process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_VERSION;

    // Vercel / AWS Lambda Config
    if (isVercel) {
        console.log('[Browser] Launching in Vercel/Lambda environment');
        // @ts-ignore - types mismatch commonly with sparticuz
        const executablePath = await chromium.executablePath();

        return puppeteerExtra.launch({
            args: [...chromium.args, '--no-sandbox', '--disable-setuid-sandbox'],
            defaultViewport: (chromium as any).defaultViewport,
            executablePath: executablePath,
            headless: (chromium as any).headless,
            ignoreHTTPSErrors: true,
        });
    }

    // Local Development Config
    console.log('[Browser] Launching in Local environment');
    try {
        // Use puppeteer-extra with local chrome
        return puppeteerExtra.launch({
            channel: 'chrome',
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
    } catch (e) {
        return puppeteerExtra.launch({
            executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            headless: true,
            args: ['--no-sandbox']
        });
    }
}
