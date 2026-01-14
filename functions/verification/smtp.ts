import axios from 'axios';
import * as dns from 'dns';
import { promisify } from 'util';

const resolveMx = promisify(dns.resolveMx);

/**
 * Email Verification Engine
 * 
 * Vercel blocks Port 25, so we use a multi-strategy approach:
 * 1. API-based verification (Abstract API, ZeroBounce) - Most reliable
 * 2. DNS MX record check - Basic validation
 * 3. Syntax validation - Fallback
 */

export type VerificationStatus = 'valid' | 'invalid' | 'risky' | 'unknown';

export interface VerificationResult {
    email: string;
    status: VerificationStatus;
    reason?: string;
}

const TIMEOUT_MS = 5000;

/**
 * Verifies an email address using the best available method.
 * Priority: API -> MX Check -> Syntax
 */
export async function verifyEmail(email: string): Promise<VerificationResult> {
    // 1. Basic format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return { email, status: 'invalid', reason: 'Invalid email format' };
    }

    const domain = email.split('@')[1];

    // 2. Try API-based verification if key is available
    if (process.env.EMAIL_VERIFY_API_KEY) {
        try {
            const result = await verifyWithAbstractAPI(email);
            if (result.status !== 'unknown') {
                return result;
            }
        } catch (err: any) {
            console.warn(`[Email Verify] API verification failed: ${err.message}`);
        }
    }

    // 3. Try ZeroBounce if available
    if (process.env.ZEROBOUNCE_API_KEY) {
        try {
            const result = await verifyWithZeroBounce(email);
            if (result.status !== 'unknown') {
                return result;
            }
        } catch (err: any) {
            console.warn(`[Email Verify] ZeroBounce failed: ${err.message}`);
        }
    }

    // 4. Fallback to MX record check (verifies domain can receive email)
    try {
        const mxResult = await verifyMXRecord(domain);
        if (mxResult.status === 'invalid') {
            return { email, status: 'invalid', reason: 'Domain cannot receive email' };
        }
        // MX exists but we can't verify the specific user
        return { email, status: 'risky', reason: 'Domain valid, user unverified (no API key)' };
    } catch (err: any) {
        console.warn(`[Email Verify] MX check failed: ${err.message}`);
    }

    // 5. If all methods fail, return unknown
    return { email, status: 'unknown', reason: 'Verification unavailable' };
}

/**
 * Abstract API email verification
 * Free tier: 100 validations/month
 * https://www.abstractapi.com/api/email-verification-validation-api
 */
async function verifyWithAbstractAPI(email: string): Promise<VerificationResult> {
    const response = await axios.get('https://emailvalidation.abstractapi.com/v1/', {
        params: {
            api_key: process.env.EMAIL_VERIFY_API_KEY,
            email: email
        },
        timeout: TIMEOUT_MS
    });

    const data = response.data;
    console.log(`[Email Verify - Abstract] Response for ${email}:`, JSON.stringify(data));

    // Abstract API response fields:
    // deliverability: "DELIVERABLE" | "UNDELIVERABLE" | "UNKNOWN"
    // is_valid_format, is_mx_found, is_smtp_valid, is_catchall_email, is_disposable_email, is_role_email

    if (data.deliverability === 'DELIVERABLE' && data.is_smtp_valid?.value === true) {
        return { email, status: 'valid', reason: 'Verified via Abstract API' };
    } else if (data.deliverability === 'UNDELIVERABLE') {
        return { email, status: 'invalid', reason: data.is_smtp_valid?.text || 'Undeliverable' };
    } else if (data.is_catchall_email?.value === true) {
        return { email, status: 'risky', reason: 'Catch-all domain' };
    } else if (data.is_disposable_email?.value === true) {
        return { email, status: 'risky', reason: 'Disposable email' };
    } else if (data.is_mx_found?.value === true) {
        return { email, status: 'risky', reason: 'MX valid, SMTP unverified' };
    }

    return { email, status: 'unknown', reason: 'Unable to determine' };
}

/**
 * ZeroBounce email verification
 * Alternative provider with different pricing/limits
 */
async function verifyWithZeroBounce(email: string): Promise<VerificationResult> {
    const response = await axios.get('https://api.zerobounce.net/v2/validate', {
        params: {
            api_key: process.env.ZEROBOUNCE_API_KEY,
            email: email
        },
        timeout: TIMEOUT_MS
    });

    const data = response.data;
    console.log(`[Email Verify - ZeroBounce] Response for ${email}:`, JSON.stringify(data));

    // ZeroBounce status: "valid", "invalid", "catch-all", "unknown", "spamtrap", "abuse", "do_not_mail"
    if (data.status === 'valid') {
        return { email, status: 'valid', reason: 'Verified via ZeroBounce' };
    } else if (data.status === 'invalid') {
        return { email, status: 'invalid', reason: data.sub_status || 'Invalid address' };
    } else if (data.status === 'catch-all') {
        return { email, status: 'risky', reason: 'Catch-all domain' };
    } else if (['spamtrap', 'abuse', 'do_not_mail'].includes(data.status)) {
        return { email, status: 'invalid', reason: `Flagged: ${data.status}` };
    }

    return { email, status: 'unknown', reason: 'Unable to determine' };
}

/**
 * MX Record verification (DNS-based)
 * Checks if the domain has valid mail servers configured.
 * This is a baseline check that works everywhere including Vercel.
 */
async function verifyMXRecord(domain: string): Promise<{ status: 'valid' | 'invalid' | 'unknown' }> {
    try {
        const mxRecords = await resolveMx(domain);
        if (mxRecords && mxRecords.length > 0) {
            console.log(`[Email Verify - MX] Found ${mxRecords.length} MX records for ${domain}`);
            return { status: 'valid' };
        }
        return { status: 'invalid' };
    } catch (err: any) {
        if (err.code === 'ENODATA' || err.code === 'ENOTFOUND') {
            return { status: 'invalid' };
        }
        return { status: 'unknown' };
    }
}

/**
 * Batch verification for multiple emails
 * Uses parallel requests with rate limiting
 */
export async function verifyEmailBatch(emails: string[], concurrency: number = 3): Promise<VerificationResult[]> {
    const results: VerificationResult[] = [];

    for (let i = 0; i < emails.length; i += concurrency) {
        const batch = emails.slice(i, i + concurrency);
        const batchResults = await Promise.all(batch.map(email => verifyEmail(email)));
        results.push(...batchResults);

        // Small delay between batches to respect rate limits
        if (i + concurrency < emails.length) {
            await new Promise(resolve => setTimeout(resolve, 200));
        }
    }

    return results;
}
