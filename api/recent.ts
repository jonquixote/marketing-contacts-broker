import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from '../functions/utils/db';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const { rows: profiles } = await sql`
      SELECT * FROM profiles
      ORDER BY created_at DESC
      LIMIT 20
    `;

        const enriched = profiles.map((p: any) => ({
            name: p.name,
            headline: p.normalized_title,
            linkedinUrl: p.linkedin_url,
            email: p.raw_data?.email,
            emailStatus: p.raw_data?.status || 'valid',
            verificationDetails: 'Recently Discovered',
            address: p.raw_data?.address,
            phone: p.raw_data?.phone,
            website: p.website,
            status: p.status,
            raw_data: p.raw_data,
            imageUrl: p.raw_data?.imageUrl,
            education: p.raw_data?.education,
            workHistory: p.raw_data?.workHistory
        }));

        res.status(200).json(enriched);
    } catch (error: any) {
        console.error('[API] Recent Error:', error);
        res.status(500).json({ error: error.message });
    }
}
