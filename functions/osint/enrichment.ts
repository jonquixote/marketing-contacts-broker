import axios from 'axios';
import { ScrapedProfile } from './corporate';

/**
 * Profile Enrichment Engine
 * 
 * Adds additional data points like direct phone, work email, and social profiles
 * using various data enrichment APIs.
 * 
 * Supported APIs (in order of preference):
 * - Hunter.io (email finding)
 * - Clearbit (company enrichment)
 * - RocketReach (contact discovery)
 */

export interface EnrichmentData {
    email?: string;
    emailConfidence?: number;
    phone?: string;
    linkedinUrl?: string;
    twitterUrl?: string;
    companyDomain?: string;
    companyLogo?: string;
    jobTitle?: string;
}

/**
 * Enrich a profile with additional contact data
 * @param profile Basic profile from search
 * @param company Company name for context
 */
export async function enrichProfile(
    profile: ScrapedProfile,
    company: string
): Promise<EnrichmentData> {
    const result: EnrichmentData = {};
    const nameParts = profile.name.split(' ');

    if (nameParts.length < 2) {
        return result; // Need at least first and last name
    }

    const firstName = nameParts[0];
    const lastName = nameParts[nameParts.length - 1];

    // Try Hunter.io for email finding
    if (process.env.HUNTER_API_KEY) {
        try {
            const hunterResult = await findEmailWithHunter(firstName, lastName, company);
            if (hunterResult.email) {
                result.email = hunterResult.email;
                result.emailConfidence = hunterResult.confidence;
            }
        } catch (err: any) {
            console.warn(`[Enrichment] Hunter failed: ${err.message}`);
        }
    }

    // Try Clearbit for company enrichment
    if (process.env.CLEARBIT_API_KEY && !result.companyDomain) {
        try {
            const clearbitResult = await enrichWithClearbit(company);
            if (clearbitResult) {
                result.companyDomain = clearbitResult.domain;
                result.companyLogo = clearbitResult.logo;
            }
        } catch (err: any) {
            console.warn(`[Enrichment] Clearbit failed: ${err.message}`);
        }
    }

    // Try RocketReach for full contact info
    if (process.env.ROCKETREACH_API_KEY) {
        try {
            const rrResult = await findWithRocketReach(firstName, lastName, company);
            if (rrResult) {
                if (!result.email && rrResult.email) result.email = rrResult.email;
                if (rrResult.phone) result.phone = rrResult.phone;
                if (rrResult.linkedinUrl) result.linkedinUrl = rrResult.linkedinUrl;
                if (rrResult.twitterUrl) result.twitterUrl = rrResult.twitterUrl;
            }
        } catch (err: any) {
            console.warn(`[Enrichment] RocketReach failed: ${err.message}`);
        }
    }

    return result;
}

/**
 * Hunter.io Email Finder
 * Free tier: 25 searches/month
 */
async function findEmailWithHunter(
    firstName: string,
    lastName: string,
    company: string
): Promise<{ email?: string; confidence?: number }> {
    // First, find the company domain
    const domainResponse = await axios.get('https://api.hunter.io/v2/domain-search', {
        params: {
            company: company,
            api_key: process.env.HUNTER_API_KEY
        },
        timeout: 10000
    });

    const domain = domainResponse.data?.data?.domain;
    if (!domain) {
        return {};
    }

    // Then find the email
    const emailResponse = await axios.get('https://api.hunter.io/v2/email-finder', {
        params: {
            domain: domain,
            first_name: firstName,
            last_name: lastName,
            api_key: process.env.HUNTER_API_KEY
        },
        timeout: 10000
    });

    const data = emailResponse.data?.data;
    if (data?.email) {
        console.log(`[Hunter] Found email for ${firstName} ${lastName}: ${data.email} (${data.score}% confidence)`);
        return {
            email: data.email,
            confidence: data.score
        };
    }

    return {};
}

/**
 * Clearbit Company/Domain Lookup
 */
async function enrichWithClearbit(
    company: string
): Promise<{ domain?: string; logo?: string } | null> {
    const response = await axios.get('https://company.clearbit.com/v2/companies/find', {
        params: { name: company },
        headers: {
            'Authorization': `Bearer ${process.env.CLEARBIT_API_KEY}`
        },
        timeout: 10000
    });

    const data = response.data;
    if (data?.domain) {
        return {
            domain: data.domain,
            logo: data.logo
        };
    }

    return null;
}

/**
 * RocketReach Person Lookup
 * Most comprehensive but also most expensive
 */
async function findWithRocketReach(
    firstName: string,
    lastName: string,
    company: string
): Promise<EnrichmentData | null> {
    const response = await axios.get('https://api.rocketreach.co/v2/api/lookupProfile', {
        params: {
            name: `${firstName} ${lastName}`,
            current_employer: company
        },
        headers: {
            'Api-Key': process.env.ROCKETREACH_API_KEY
        },
        timeout: 15000
    });

    const data = response.data;
    if (data?.id) {
        return {
            email: data.emails?.[0]?.email,
            phone: data.phones?.[0]?.number,
            linkedinUrl: data.linkedin_url,
            twitterUrl: data.twitter_url,
            jobTitle: data.current_title
        };
    }

    return null;
}

/**
 * Batch enrich multiple profiles
 * Rate-limited to avoid API throttling
 */
export async function enrichProfiles(
    profiles: ScrapedProfile[],
    company: string,
    maxProfiles: number = 5
): Promise<Map<string, EnrichmentData>> {
    const results = new Map<string, EnrichmentData>();
    const toEnrich = profiles.slice(0, maxProfiles);

    for (const profile of toEnrich) {
        try {
            const enrichment = await enrichProfile(profile, company);
            results.set(profile.name, enrichment);

            // Small delay between API calls
            await new Promise(resolve => setTimeout(resolve, 300));
        } catch (err: any) {
            console.error(`[Enrichment] Failed for ${profile.name}: ${err.message}`);
        }
    }

    return results;
}
