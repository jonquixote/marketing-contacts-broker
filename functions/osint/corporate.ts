import { getBrowser } from '../utils/browser';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import axios from 'axios';
import * as dotenv from 'dotenv';

dotenv.config();
puppeteer.use(StealthPlugin());

export interface SearchTarget {
  role: string;
  company: string;
}

export interface ScrapedProfile {
  name: string;
  headline: string;
  linkedinUrl: string;
  phone?: string; // Added phone
  imageUrl?: string;
  education?: string;
  workHistory?: string;
}

/**
 * Engine A: Corporate Intelligence
 * Priority 1: Google Custom Search API (Reliable, Paid/Free Tier)
 * Priority 2: Puppeteer Stealth (Free, Flaky/Blocked)
 */
export async function runCorporateSearch(target: SearchTarget): Promise<ScrapedProfile[]> {
  const { role, company } = target;
  // Dork: site:linkedin.com/in ("Role" OR "Head of Role") "Company"
  const query = `site:linkedin.com/in ("${role}" OR "Head of ${role}" OR "Director of ${role}") "${company}"`;

  // 1. Try Google API if credentials exist
  if (process.env.GOOGLE_API_KEY && process.env.GOOGLE_CX) {
    console.log(`[Engine A - API] Executing Search: ${query}`);
    try {
      const res = await axios.get('https://www.googleapis.com/customsearch/v1', {
        params: {
          key: process.env.GOOGLE_API_KEY,
          cx: process.env.GOOGLE_CX,
          q: query,
          num: 10
        }
      });

      if (res.data.items) {
        // 1. Parse Primary Results
        let profiles: ScrapedProfile[] = res.data.items.map((item: any) => {
          const titleParts = item.title.split(' - ');

          // Rich Snippet Extraction
          const metatags = item.pagemap?.metatags?.[0] || {};
          const description = metatags['og:description'] || item.snippet?.replace(/\n/g, ' ').trim() || '';
          const image = metatags['og:image'] || item.pagemap?.cse_image?.[0]?.src;

          // Extract Work History & Education
          // Format: "Experience: Company A · Education: University B · Location: City"
          const experienceMatch = description.match(/Experience:\s*(.*?)(?:\s·\sEducation:|\s·\sLocation:|$)/i);
          const educationMatch = description.match(/Education:\s*(.*?)(?:\s·\sLocation:|$)/i);

          // Initial Phone Check (Primary Snippet)
          const snippet = item.snippet?.replace(/\n/g, ' ').trim() || '';
          const phoneMatch = snippet.match(/(\+\d{1,2}\s)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/);
          let phone = phoneMatch ? phoneMatch[0] : undefined;

          return {
            name: titleParts[0] || 'Unknown',
            headline: description, // Full Bio
            linkedinUrl: item.link,
            phone: phone,
            imageUrl: image,
            workHistory: experienceMatch ? experienceMatch[1] : undefined,
            education: educationMatch ? educationMatch[1] : undefined
          };
        });

        console.log(`[Engine A - API] Found ${profiles.length} profiles. Enriched with metadata.`);

        // 2. Secondary Search for Phone Numbers (Top 5 only to save quota)
        const topProfiles = profiles.slice(0, 5);
        const enrichmentPromises = topProfiles.map(async (profile) => {
          if (profile.phone) return profile; // Already has phone

          const phoneQuery = `"${profile.name}" "${company}" (phone OR mobile OR contact) -site:linkedin.com`;
          try {
            const phoneRes = await axios.get('https://www.googleapis.com/customsearch/v1', {
              params: {
                key: process.env.GOOGLE_API_KEY,
                cx: process.env.GOOGLE_CX,
                q: phoneQuery,
                num: 3
              }
            });

            if (phoneRes.data.items) {
              for (const item of phoneRes.data.items) {
                const snippet = item.snippet || '';
                const match = snippet.match(/(\+\d{1,2}\s)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/);
                if (match) {
                  profile.phone = match[0];
                  break; // Found one
                }
              }
            }
          } catch (err) {
            // Ignore enrichment errors
          }
          return profile;
        });

        // Wait for enrichment (fast, parallel)
        await Promise.all(enrichmentPromises);

        return profiles;
      } else {
        console.log('[Engine A - API] No results found.');
        return [];
      }
    } else if (process.env.SERPAPI_KEY) {
      console.log('[Engine A] GOOGLE_API_KEY missing. Trying SerpAPI...');
      try {
        const res = await axios.get('https://serpapi.com/search', {
          params: {
            api_key: process.env.SERPAPI_KEY,
            engine: 'google',
            q: query,
            num: 10,
            gl: 'us',
            hl: 'en'
          }
        });

        if (res.data.organic_results) {
          let profiles = res.data.organic_results
            .filter((item: any) => item.link.includes('linkedin.com/in/'))
            .map((item: any) => ({
              name: item.title.split(' - ')[0] || 'Unknown',
              headline: item.snippet || '',
              linkedinUrl: item.link,
              imageUrl: item.thumbnail || undefined
            }));

          console.log(`[Engine A - SerpAPI] Found ${profiles.length} profiles.`);
          return profiles;
        }
      } catch (error) {
        console.error(`[Engine A - SerpAPI] Failed: ${(error as any).message}`);
      }
    } else {
      console.log('[Engine A] Missing GOOGLE_API_KEY and SERPAPI_KEY. Skipping API search.');
    }

    // 2. Fallback to Stealth Mode (Likely Blocked, but worth a try if API fails)
    // Switch to UK Google to potentially bypass US-centric datacenter blocks
    const searchUrl = `https://www.google.co.uk/search?q=${encodeURIComponent(query)}&hl=en&gl=uk`;

    console.log(`[Engine A - Stealth] Executing Search: ${query}`);

    const browser = await getBrowser();

    try {
      const page = await browser.newPage();
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

      // Check for CAPTCHA
      if (await page.$('iframe[src*="google.com/recaptcha"]')) {
        console.error('[Engine A] CAPTCHA detected despite stealth mode.');
        throw new Error('Google CAPTCHA detected');
      }

      // Parse Google SERP
      const profiles = await page.evaluate(() => {
        const results: any[] = [];
        // Generic selector: Find any anchor tag with a LinkedIn profile URL
        const links = document.querySelectorAll('a[href*="linkedin.com/in/"]');

        links.forEach((link) => {
          const url = (link as HTMLAnchorElement).href;
          // Try to find the title in the parent or the link text itself
          let titleText = (link as HTMLElement).innerText;
          const h3 = link.querySelector('h3');
          if (h3) titleText = h3.innerText;

          // Clean up title
          if (titleText && !url.includes('/dir/') && !url.includes('/jobs/')) {
            const parts = titleText.split(' - ');
            const name = parts[0] || 'Unknown';
            const headline = parts.slice(1).join(' - ').replace('| LinkedIn', '').replace('...', '').trim();

            results.push({
              name,
              headline,
              linkedinUrl: url
            });
          }
        });
        return results;
      });

      console.log(`[Engine A - Stealth] Found ${profiles.length} profiles.`);

      if (profiles.length === 0) {
        console.log('[Engine A - Stealth] 0 results. Dumping HTML snippet...');
        const content = await page.content();
        console.log(content.substring(0, 1000)); // Log first 1000 chars to identify block/consent page
      }

      return profiles;

    } catch (error) {
      console.error(`[Engine A - Stealth] Failed: ${(error as any).message}`);
      console.log('[Engine A] NOTE: Corporate search is currently blocked by Google/Bing CAPTCHAs on this IP. An API key or Proxy is required for reliable corporate data.');
      return [];
    } finally {
      await browser.close();
    }
  }
