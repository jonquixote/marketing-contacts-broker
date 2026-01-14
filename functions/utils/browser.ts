import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';

export async function getBrowser() {
    const isVercel = process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_VERSION;

    // Vercel / AWS Lambda Config
    if (isVercel) {
        console.log('[Browser] Launching in Vercel/Lambda environment (Standard Core)');
        // @ts-ignore
        const executablePath = await chromium.executablePath();

        return puppeteer.launch({
            args: [...chromium.args, '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
            defaultViewport: (chromium as any).defaultViewport,
            executablePath: executablePath,
            headless: (chromium as any).headless,
            ignoreHTTPSErrors: true,
        } as any);
    }

    // Local Development Config
    console.log('[Browser] Launching in Local environment');
    try {
        return puppeteer.launch({
            channel: 'chrome',
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
    } catch (e) {
        return puppeteer.launch({
            executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            headless: true,
            args: ['--no-sandbox']
        });
    }
}
