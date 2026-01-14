import type { VercelRequest, VercelResponse } from '@vercel/node';
import { chromium } from 'playwright-core';
import { sql } from '../functions/utils/db';
import { runCorporateSearch, ScrapedProfile } from '../functions/osint/corporate';
import { runDuckDuckGoSearch } from '../functions/osint/duckduckgo';
import { runSmbSearch, SmbProfile } from '../functions/osint/smb';
import { runBingSearch } from '../functions/osint/bing';
import { generateEmailPermutations } from '../functions/verification/permutator';
import { verifyEmail, VerificationResult } from '../functions/verification/smtp';

export interface SearchRequest {
    type: 'corp' | 'smb';
    role?: string;     // For Corp
    company?: string;  // For Corp
    businessType?: string; // For SMB
    location?: string;     // For SMB
}

export interface EnrichedProfile extends ScrapedProfile {
    email?: string;
    emailStatus?: string;
    verificationDetails?: string;
    // SMB fields
    address?: string;
    phone?: string;
    website?: string;
    status?: string; // 'active' | 'flagged'
    raw_data?: any; // Full raw data for popup
    imageUrl?: string; // Profile picture
    education?: string;
    workHistory?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const request = req.body as SearchRequest;
    console.log(`[API] Received request: ${JSON.stringify(request)}`);

    const { type, role, company, businessType, location } = request;

    if (!type) {
        return res.status(400).json({ error: 'Missing search type' });
    }

    const isSmb = type === 'smb';
    const companyOrType = isSmb ? businessType! : company!;
    const roleOrLocation = isSmb ? location! : role!;

    if (!companyOrType || !roleOrLocation) {
        return res.status(400).json({ error: 'Missing required search parameters' });
    }

    try {
        // 1. Check Cache (Postgres)
        // We want matching records.
        // Logic: company ILIKE ... AND normalized_title ILIKE ...
        let rows;

        if (isSmb) {
            const result = await sql`
        SELECT * FROM profiles 
        WHERE company ILIKE ${`%${location}%`} 
        AND normalized_title ILIKE ${`%${businessType}%`}
      `;
            rows = result.rows;
        } else {
            const result = await sql`
        SELECT * FROM profiles 
        WHERE company ILIKE ${company} 
        AND normalized_title ILIKE ${`%${role}%`}
      `;
            rows = result.rows;
        }

        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const freshProfiles = rows.filter((p: any) => new Date(p.last_verified_at) > thirtyDaysAgo);

        if (freshProfiles.length > 0) {
            console.log(`[API] Cache Hit: Found ${freshProfiles.length} fresh profiles.`);
            const enriched = freshProfiles.map((p: any) => ({
                name: p.name,
                headline: p.normalized_title,
                linkedinUrl: p.linkedin_url,
                email: p.raw_data?.email,
                emailStatus: p.raw_data?.status || 'valid',
                verificationDetails: 'Cached Result',
                address: p.raw_data?.address,
                phone: p.raw_data?.phone,
                website: p.website,
                status: p.status,
                raw_data: p.raw_data,
                imageUrl: p.raw_data?.imageUrl,
                education: p.raw_data?.education,
                workHistory: p.raw_data?.workHistory
            }));
            return res.status(200).json(enriched);
        }

        console.log('[API] Cache Miss or Stale. Triggering OSINT Engine...');

        // 2. Run Search
        let scrapedResults: EnrichedProfile[] = [];

        if (isSmb) {
            let ypQuery = request.businessType!;
            if (ypQuery.toLowerCase() === 'agency') ypQuery = 'Marketing Agency';
            if (ypQuery.toLowerCase() === 'firm') ypQuery = 'Marketing Firm';

            const results = await runSmbSearch({ businessType: ypQuery, location: request.location! });
            scrapedResults = results.map(r => ({
                name: r.name,
                headline: r.address,
                linkedinUrl: r.website || '',
                email: `contact@${r.website?.replace('www.', '').replace('https://', '').split('/')[0] || 'gmail.com'}`,
                emailStatus: 'risky',
                verificationDetails: 'Scraped from YellowPages',
                address: r.address,
                phone: r.phone,
                website: r.website,
                raw_data: { ...r, source: 'YellowPages' }
            }));

        } else {
            let profiles = await runCorporateSearch({ role: request.role!, company: request.company! });

            if (profiles.length === 0) {
                console.log('[API] Primary engine yielded no results. Trying Bing...');
                // Note: Chromium launch on Vercel requires specific args usually.
                // We will attempt standard launch, but this may fail on Free Tier without specific configuration.
                try {
                    const browser = await chromium.launch({ headless: true });
                    const page = await browser.newPage();
                    try { profiles = await runBingSearch({ role: request.role!, company: request.company! }, page); }
                    finally { await browser.close(); }
                } catch (e) {
                    console.error("Failed to launch chromium for Bing fallback", e);
                }
            }

            const topProfiles = profiles.slice(0, 5);
            for (const profile of topProfiles) {
                const enriched: EnrichedProfile = { ...profile };
                const nameParts = profile.name.split(' ');
                if (nameParts.length >= 2) {
                    const firstName = nameParts[0];
                    const lastName = nameParts[nameParts.length - 1];
                    const domain = `${request.company!.toLowerCase().replace(/\s+/g, '')}.com`;
                    const candidates = generateEmailPermutations({ firstName, lastName, domain });

                    let foundValid = false;
                    for (const email of candidates) {
                        const result = await verifyEmail(email);
                        if (result.status === 'valid') {
                            enriched.email = email;
                            enriched.emailStatus = 'valid';
                            enriched.verificationDetails = 'SMTP Handshake Verified';
                            foundValid = true;
                            break;
                        } else if (result.status === 'risky' && !enriched.email) {
                            enriched.email = email;
                            enriched.emailStatus = 'risky';
                        }
                    }
                    if (!foundValid && !enriched.email) enriched.emailStatus = 'not_found';
                }
                enriched.raw_data = {
                    ...profile,
                    email: enriched.email,
                    status: enriched.emailStatus,
                    details: enriched.verificationDetails,
                    source: 'GoogleAPI',
                    imageUrl: enriched.imageUrl,
                    education: enriched.education,
                    workHistory: enriched.workHistory
                };
                scrapedResults.push(enriched);
            }
        }

        // 3. Sync with Database (Upsert)
        if (scrapedResults.length > 0) {
            // Upsert one by one for simplicity with sql template literals
            for (const p of scrapedResults) {
                const normalized_title = isSmb ? request.businessType : p.headline;
                const company = isSmb ? request.location : request.company;
                const linkedin_url = p.linkedinUrl || `smb:${p.name}:${p.address}`;
                const website = p.website || null;
                const last_verified_at = new Date().toISOString();
                const raw_data = {
                    email: p.email,
                    status: p.emailStatus,
                    details: p.verificationDetails,
                    address: p.address,
                    phone: p.phone,
                    row_status: 'active'
                };

                await sql`
                INSERT INTO profiles (name, normalized_title, company, linkedin_url, website, last_verified_at, status, raw_data)
                VALUES (${p.name}, ${normalized_title}, ${company}, ${linkedin_url}, ${website}, ${last_verified_at}, 'active', ${JSON.stringify(raw_data)})
                ON CONFLICT (linkedin_url) 
                DO UPDATE SET 
                    name = EXCLUDED.name,
                    normalized_title = EXCLUDED.normalized_title,
                    company = EXCLUDED.company,
                    website = EXCLUDED.website,
                    last_verified_at = EXCLUDED.last_verified_at,
                    status = EXCLUDED.status,
                    raw_data = EXCLUDED.raw_data
            `;
            }
        }

        return res.status(200).json(scrapedResults);

    } catch (error: any) {
        console.error('[API] Error:', error);
        return res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
}
