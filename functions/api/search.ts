import { chromium } from 'playwright-core';
import { runCorporateSearch, ScrapedProfile } from '../osint/corporate';
import { runDuckDuckGoSearch } from '../osint/duckduckgo';
import { runSmbSearch, SmbProfile } from '../osint/smb';
import { runBingSearch } from '../osint/bing';
import { generateEmailPermutations } from '../verification/permutator';
import { verifyEmail, VerificationResult } from '../verification/smtp';
import { supabase } from '../utils/supabase';

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

export async function handleSearchRequest(request: SearchRequest): Promise<EnrichedProfile[]> {
  console.log(`[API] Received request: ${JSON.stringify(request)}`);

  const isSmb = request.type === 'smb';
  const companyOrType = isSmb ? request.businessType! : request.company!;
  const roleOrLocation = isSmb ? request.location! : request.role!;

  if (!companyOrType || !roleOrLocation) throw new Error('Missing required search parameters');

  // 1. Check Cache (Supabase) - Get ALL matching records, regardless of age
  let query = supabase.from('profiles').select('*');

  if (isSmb) {
    query = query.ilike('company', `%${request.location}%`).ilike('normalized_title', `%${request.businessType}%`);
  } else {
    query = query.ilike('company', request.company!).ilike('normalized_title', `%${request.role}%`);
  }

  const { data: cachedProfiles, error } = await query;

  if (error) console.error('[API] Cache Query Error:', error);

  const now = new Date();
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Filter for fresh results
  const freshProfiles = cachedProfiles?.filter(p => new Date(p.last_verified_at) > thirtyDaysAgo) || [];

  // If we have fresh results, return them immediately (Save API credits)
  if (freshProfiles.length > 0) {
    console.log(`[API] Cache Hit: Found ${freshProfiles.length} fresh profiles.`);
    return freshProfiles.map(p => ({
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
      raw_data: p.raw_data, // Pass full raw data
      imageUrl: p.raw_data?.imageUrl,
      education: p.raw_data?.education,
      workHistory: p.raw_data?.workHistory
    }));
  }

  console.log('[API] Cache Miss or Stale. Triggering OSINT Engine...');

  // 2. Run Search
  let scrapedResults: EnrichedProfile[] = [];

  if (isSmb) {
    // Refine query for YellowPages
    let ypQuery = request.businessType!;
    if (ypQuery.toLowerCase() === 'agency') ypQuery = 'Marketing Agency';
    if (ypQuery.toLowerCase() === 'firm') ypQuery = 'Marketing Firm';

    const results = await runSmbSearch({ businessType: ypQuery, location: request.location! });
    scrapedResults = results.map(r => ({
      name: r.name,
      headline: r.address, // Map address to headline for UI
      linkedinUrl: r.website || '', // Website as URL
      email: `contact@${r.website?.replace('www.', '').replace('https://', '').split('/')[0] || 'gmail.com'}`,
      emailStatus: 'risky',
      verificationDetails: 'Scraped from YellowPages',
      address: r.address,
      phone: r.phone,
      website: r.website,
      raw_data: { ...r, source: 'YellowPages' } // Pass raw data
    }));

  } else {
    // Corporate Search
    let profiles = await runCorporateSearch({ role: request.role!, company: request.company! });

    // Fallbacks (Bing/DDG) if Google API & Stealth fail
    if (profiles.length === 0) {
      console.log('[API] Primary engine yielded no results. Trying Bing...');
      const browser = await chromium.launch({ headless: true });
      const page = await browser.newPage();
      try { profiles = await runBingSearch({ role: request.role!, company: request.company! }, page); }
      finally { await browser.close(); }
    }

    // Verify Emails for Corporate
    const topProfiles = profiles.slice(0, 5); // Process top 5
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

  // 3. Sync with Database (Upsert & Flag)
  if (scrapedResults.length > 0) {
    const upsertData = scrapedResults.map(p => ({
      name: p.name,
      normalized_title: isSmb ? request.businessType : p.headline, // Store Type/Role
      company: isSmb ? request.location : request.company, // Store Location/Company
      linkedin_url: p.linkedinUrl || `smb:${p.name}:${p.address}`, // Unique ID fallback for SMB
      website: p.website,
      last_verified_at: new Date().toISOString(),
      // REMOVED: Column missing in remote DB. Stored in raw_data instead.
      raw_data: {
        email: p.email,
        status: p.emailStatus,
        details: p.verificationDetails,
        address: p.address,
        phone: p.phone,
        row_status: 'active' // Store here
      }
    }));

    // Upsert new/found records
    const { error: upsertError } = await supabase.from('profiles').upsert(upsertData, { onConflict: 'linkedin_url' });
    if (upsertError) console.error('[API] Upsert Error:', upsertError);

    // 4. Flag Missing Records
    // If we had cached profiles (stale), check which ones are NOT in the new scraped results
    if (cachedProfiles && cachedProfiles.length > 0) {
      const scrapedIds = new Set(upsertData.map(u => u.linkedin_url));
      const missingProfiles = cachedProfiles.filter(p => !scrapedIds.has(p.linkedin_url));

      if (missingProfiles.length > 0) {
        console.log(`[API] Flagging ${missingProfiles.length} profiles as missing/removed.`);
        // TODO: Update row_status in raw_data. Requires fetching or SQL function.
        // Skipping for now to ensure stability.
      }
    }
  }

  return scrapedResults;
}
