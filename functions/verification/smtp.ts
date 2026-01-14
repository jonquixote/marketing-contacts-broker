import * as net from 'net';
import * as dns from 'dns';
import { promisify } from 'util';

const resolveMx = promisify(dns.resolveMx);

/**
 * SMTP Verification Engine
 * Performs a "handshake" verification (HELO -> MAIL FROM -> RCPT TO)
 * to check if an email address exists without sending an actual email.
 */

export type VerificationStatus = 'valid' | 'invalid' | 'risky' | 'unknown';

export interface VerificationResult {
    email: string;
    status: VerificationStatus;
    reason?: string;
}

const TIMEOUT_MS = 5000; // 5 seconds timeout per check

/**
 * Verifies a single email address via SMTP handshake.
 */
export async function verifyEmail(email: string): Promise<VerificationResult> {
    const domain = email.split('@')[1];

    if (!domain) {
        return { email, status: 'invalid', reason: 'Invalid format' };
    }

    try {
        // 1. Get MX Records
        const mxRecords = await resolveMx(domain);
        if (!mxRecords || mxRecords.length === 0) {
            return { email, status: 'invalid', reason: 'No MX records found' };
        }

        // Sort by priority (lowest number is highest priority)
        const bestMx = mxRecords.sort((a, b) => a.priority - b.priority)[0].exchange;

        // 2. Perform SMTP Handshake
        return await performSmtpHandshake(email, bestMx);

    } catch (error: any) {
        console.error(`DNS/Network error for ${email}:`, error.message);
        return { email, status: 'unknown', reason: error.message };
    }
}

function performSmtpHandshake(email: string, mxHost: string): Promise<VerificationResult> {
    return new Promise((resolve) => {
        const socket = new net.Socket();
        let step = 0; // 0: Connect, 1: HELO, 2: MAIL FROM, 3: RCPT TO
        let receivedData = '';
        let isResolved = false;

        // Cleanup and resolve helper
        const finish = (status: VerificationStatus, reason?: string) => {
            if (isResolved) return;
            isResolved = true;
            socket.destroy();
            resolve({ email, status, reason });
        };

        socket.setTimeout(TIMEOUT_MS);

        socket.on('connect', () => {
            // Wait for greeting
        });

        socket.on('timeout', () => {
            finish('unknown', 'Connection timed out');
        });

        socket.on('error', (err) => {
            finish('unknown', `Socket error: ${err.message}`);
        });

        socket.on('data', (data) => {
            const response = data.toString();
            receivedData += response;

            const code = parseInt(response.substring(0, 3));

            // Basic SMTP flow
            if (step === 0 && code === 220) {
                // Server Greeting -> Send HELO
                step++;
                socket.write(`HELO verify-bot.com\r\n`);
            } else if (step === 1 && code === 250) {
                // HELO OK -> Send MAIL FROM
                step++;
                socket.write(`MAIL FROM:<check@verify-bot.com>\r\n`);
            } else if (step === 2 && code === 250) {
                // MAIL FROM OK -> Send RCPT TO (The actual check)
                step++;
                socket.write(`RCPT TO:<${email}>\r\n`);
            } else if (step === 3) {
                // RCPT TO Response
                if (code === 250) {
                    finish('valid', 'Server accepted recipient');
                } else if (code === 550) {
                    finish('invalid', 'User unknown');
                } else {
                    // Catch-all or other errors often return 250 or specific codes.
                    // A true catch-all check requires probing a non-existent user first, 
                    // but for this MVP we'll stick to basic response codes.
                    // If we get here, it's likely a block or a catch-all configuration.
                    finish('risky', `Unexpected code: ${code}`);
                }
            }
        });

        socket.connect(25, mxHost);
    });
}
