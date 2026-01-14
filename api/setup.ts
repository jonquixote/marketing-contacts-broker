import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from '../functions/utils/db';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    try {
        await sql`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`;

        await sql`
      CREATE TABLE IF NOT EXISTS profiles (
        id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
        name text NOT NULL,
        normalized_title text,
        company text,
        linkedin_url text UNIQUE,
        website text,
        last_verified_at timestamp with time zone DEFAULT now(),
        status text DEFAULT 'active',
        raw_data jsonb,
        created_at timestamp with time zone DEFAULT now(),
        updated_at timestamp with time zone DEFAULT now()
      )
    `;

        // Indices
        await sql`CREATE INDEX IF NOT EXISTS profiles_linkedin_url_idx ON profiles (linkedin_url)`;
        await sql`CREATE INDEX IF NOT EXISTS profiles_company_idx ON profiles (company)`;
        await sql`CREATE INDEX IF NOT EXISTS profiles_last_verified_at_idx ON profiles (last_verified_at)`;

        res.status(200).json({ message: 'Database initialized successfully' });
    } catch (error: any) {
        console.error('[API] Setup Error:', error);
        res.status(500).json({ error: error.message });
    }
}
