import { sql } from './functions/utils/db';
import * as dotenv from 'dotenv';

dotenv.config();

async function testConnection() {
    console.log('Testing Vercel Postgres Connection...');
    try {
        const result = await sql`SELECT NOW() as time`;
        console.log('Connection Successful!');
        console.log('Server Time:', result.rows[0].time);
    } catch (error) {
        console.error('Connection Failed:', error);
    }
}

testConnection();
