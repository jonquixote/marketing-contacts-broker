import axios from 'axios';
import { SmbProfile } from './smb';

/**
 * Google Places API Integration
 * 
 * Uses your existing Google API key with Places API enabled
 * Alternative/fallback to Yelp for local business data
 * 
 * Required env: GOOGLE_API_KEY (same as used for Custom Search)
 */

const PLACES_API_BASE = 'https://maps.googleapis.com/maps/api/place';

export interface GooglePlace {
    place_id: string;
    name: string;
    formatted_address?: string;
    formatted_phone_number?: string;
    international_phone_number?: string;
    website?: string;
    rating?: number;
    user_ratings_total?: number;
    types?: string[];
    business_status?: string;
    opening_hours?: {
        open_now?: boolean;
        weekday_text?: string[];
    };
    geometry?: {
        location: { lat: number; lng: number };
    };
}

export interface PlacesSearchResult {
    results: GooglePlace[];
    status: string;
    next_page_token?: string;
}

/**
 * Search for businesses using Google Places Text Search API
 * @param query Business type + location (e.g., "Digital Agency in Austin, TX")
 * @param maxResults Maximum results to return
 */
export async function searchPlaces(query: string, maxResults: number = 20): Promise<SmbProfile[]> {
    const apiKey = process.env.GOOGLE_API_KEY;

    if (!apiKey) {
        console.log('[Google Places] No GOOGLE_API_KEY found, skipping');
        return [];
    }

    console.log(`[Google Places] Text Search: "${query}"`);

    try {
        const response = await axios.get<PlacesSearchResult>(`${PLACES_API_BASE}/textsearch/json`, {
            params: {
                query: query,
                key: apiKey,
                type: 'establishment'
            },
            timeout: 10000
        });

        if (response.data.status !== 'OK' && response.data.status !== 'ZERO_RESULTS') {
            console.error(`[Google Places] API Error: ${response.data.status}`);
            return [];
        }

        const places = response.data.results || [];
        console.log(`[Google Places] Found ${places.length} places`);

        // Text search doesn't return phone numbers, need to fetch details for each
        // For performance, we'll do this in parallel for top results
        const detailedProfiles: SmbProfile[] = [];
        const topPlaces = places.slice(0, Math.min(maxResults, 10)); // Limit API calls

        const detailPromises = topPlaces.map(async (place) => {
            const details = await getPlaceDetails(place.place_id);
            if (details) {
                return {
                    name: details.name || place.name,
                    address: details.formatted_address || place.formatted_address || '',
                    phone: details.formatted_phone_number || '',
                    website: details.website || ''
                };
            }
            return {
                name: place.name,
                address: place.formatted_address || '',
                phone: '',
                website: ''
            };
        });

        const results = await Promise.all(detailPromises);
        detailedProfiles.push(...results);

        return detailedProfiles;

    } catch (error: any) {
        console.error(`[Google Places] Request failed: ${error.message}`);
        return [];
    }
}

/**
 * Get detailed place information including phone number
 * @param placeId Google Place ID
 */
export async function getPlaceDetails(placeId: string): Promise<GooglePlace | null> {
    const apiKey = process.env.GOOGLE_API_KEY;

    if (!apiKey) {
        return null;
    }

    try {
        const response = await axios.get(`${PLACES_API_BASE}/details/json`, {
            params: {
                place_id: placeId,
                key: apiKey,
                fields: 'name,formatted_address,formatted_phone_number,international_phone_number,website,rating,user_ratings_total,types,business_status,opening_hours'
            },
            timeout: 10000
        });

        if (response.data.status === 'OK') {
            return response.data.result;
        }

        return null;

    } catch (error: any) {
        console.error(`[Google Places] Details fetch failed for ${placeId}: ${error.message}`);
        return null;
    }
}

/**
 * Nearby search - find businesses near a specific location
 * @param lat Latitude
 * @param lng Longitude
 * @param type Business type (e.g., 'marketing_agency', 'restaurant')
 * @param radiusMeters Search radius in meters (default 5000 = 5km)
 */
export async function searchNearby(
    lat: number,
    lng: number,
    keyword: string,
    radiusMeters: number = 5000
): Promise<SmbProfile[]> {
    const apiKey = process.env.GOOGLE_API_KEY;

    if (!apiKey) {
        return [];
    }

    try {
        const response = await axios.get<PlacesSearchResult>(`${PLACES_API_BASE}/nearbysearch/json`, {
            params: {
                location: `${lat},${lng}`,
                radius: radiusMeters,
                keyword: keyword,
                key: apiKey
            },
            timeout: 10000
        });

        if (response.data.status !== 'OK') {
            return [];
        }

        const places = response.data.results || [];

        // Same pattern - fetch details for phone numbers
        const profiles: SmbProfile[] = [];
        for (const place of places.slice(0, 10)) {
            const details = await getPlaceDetails(place.place_id);
            profiles.push({
                name: details?.name || place.name,
                address: details?.formatted_address || place.formatted_address || '',
                phone: details?.formatted_phone_number || '',
                website: details?.website || ''
            });
        }

        return profiles;

    } catch (error: any) {
        console.error(`[Google Places] Nearby search failed: ${error.message}`);
        return [];
    }
}

/**
 * Geocode a location string to lat/lng coordinates
 * Useful for nearby search
 */
export async function geocodeLocation(address: string): Promise<{ lat: number; lng: number } | null> {
    const apiKey = process.env.GOOGLE_API_KEY;

    if (!apiKey) {
        return null;
    }

    try {
        const response = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
            params: {
                address: address,
                key: apiKey
            },
            timeout: 10000
        });

        if (response.data.status === 'OK' && response.data.results.length > 0) {
            return response.data.results[0].geometry.location;
        }

        return null;

    } catch (error: any) {
        console.error(`[Geocode] Failed for "${address}": ${error.message}`);
        return null;
    }
}
