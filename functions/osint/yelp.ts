import axios from 'axios';
import { SmbProfile } from './smb';

/**
 * Yelp Fusion API Integration
 * 
 * Free tier: 5000 API calls/day
 * Much more reliable than scraping YellowPages
 * 
 * Required env: YELP_API_KEY
 * Get key at: https://www.yelp.com/developers/v3/manage_app
 */

const YELP_API_BASE = 'https://api.yelp.com/v3';

export interface YelpBusiness {
    id: string;
    name: string;
    phone?: string;
    display_phone?: string;
    location?: {
        address1?: string;
        address2?: string;
        address3?: string;
        city?: string;
        state?: string;
        zip_code?: string;
        display_address?: string[];
    };
    url?: string;
    rating?: number;
    review_count?: number;
    categories?: { alias: string; title: string }[];
    image_url?: string;
    is_closed?: boolean;
}

export interface YelpSearchResult {
    businesses: YelpBusiness[];
    total: number;
    region?: any;
}

/**
 * Search for businesses using Yelp Fusion API
 * @param term Business type/category to search for  
 * @param location City, state, or full address
 * @param limit Maximum results (default 20, max 50)
 */
export async function searchYelp(term: string, location: string, limit: number = 20): Promise<SmbProfile[]> {
    const apiKey = process.env.YELP_API_KEY;

    if (!apiKey) {
        console.log('[Yelp API] No YELP_API_KEY found, skipping');
        return [];
    }

    console.log(`[Yelp API] Searching: "${term}" in "${location}"`);

    try {
        const response = await axios.get<YelpSearchResult>(`${YELP_API_BASE}/businesses/search`, {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Accept': 'application/json'
            },
            params: {
                term: term,
                location: location,
                limit: Math.min(limit, 50),
                sort_by: 'best_match'
            },
            timeout: 10000
        });

        const businesses = response.data.businesses || [];
        console.log(`[Yelp API] Found ${businesses.length} businesses (Total: ${response.data.total})`);

        // Transform to SmbProfile format
        const profiles: SmbProfile[] = businesses.map(biz => ({
            name: biz.name,
            address: biz.location?.display_address?.join(', ') || '',
            phone: biz.display_phone || biz.phone || '',
            website: biz.url || '',
            // Extended data stored in raw_data by caller
        }));

        return profiles;

    } catch (error: any) {
        if (error.response) {
            console.error(`[Yelp API] Error ${error.response.status}: ${JSON.stringify(error.response.data)}`);
        } else {
            console.error(`[Yelp API] Request failed: ${error.message}`);
        }
        return [];
    }
}

/**
 * Get detailed business information by Yelp business ID
 * Includes hours, photos, and more details
 */
export async function getYelpBusinessDetails(businessId: string): Promise<YelpBusiness | null> {
    const apiKey = process.env.YELP_API_KEY;

    if (!apiKey) {
        return null;
    }

    try {
        const response = await axios.get<YelpBusiness>(`${YELP_API_BASE}/businesses/${businessId}`, {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Accept': 'application/json'
            },
            timeout: 10000
        });

        return response.data;

    } catch (error: any) {
        console.error(`[Yelp API] Failed to get details for ${businessId}: ${error.message}`);
        return null;
    }
}

/**
 * Search businesses by phone number (reverse lookup)
 */
export async function searchYelpByPhone(phone: string): Promise<YelpBusiness | null> {
    const apiKey = process.env.YELP_API_KEY;

    if (!apiKey) {
        return null;
    }

    // Normalize phone to E.164 format (+1XXXXXXXXXX)
    const normalizedPhone = phone.replace(/\D/g, '');
    const e164Phone = normalizedPhone.startsWith('1') ? `+${normalizedPhone}` : `+1${normalizedPhone}`;

    try {
        const response = await axios.get(`${YELP_API_BASE}/businesses/search/phone`, {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Accept': 'application/json'
            },
            params: {
                phone: e164Phone
            },
            timeout: 10000
        });

        const businesses = response.data.businesses || [];
        return businesses.length > 0 ? businesses[0] : null;

    } catch (error: any) {
        console.error(`[Yelp API] Phone lookup failed: ${error.message}`);
        return null;
    }
}
