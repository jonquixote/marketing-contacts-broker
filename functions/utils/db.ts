import { sql } from '@vercel/postgres';

export { sql };

// Helper to confirm DB connection (optional usage)
export async function checkDbConnection() {
    try {
        const result = await sql`SELECTNOW()`;
        return !!result;
    } catch (error) {
        console.error('Database connection failed:', error);
        return false;
    }
}
