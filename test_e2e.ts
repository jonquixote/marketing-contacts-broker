import { handleSearchRequest } from './functions/api/search';
import { verifyEmail } from './functions/verification/smtp';
import { generateEmailPermutations } from './functions/verification/permutator';
import { supabase } from './functions/utils/supabase';

async function runTest() {
    console.log('--- Starting Component Verification Test ---');

    // 1. Test Permutator
    console.log('\n[1] Testing Permutator...');
    const perms = generateEmailPermutations({ firstName: 'John', lastName: 'Doe', domain: 'example.com' });
    console.log('Permutations:', perms);
    if (perms.includes('john.doe@example.com')) console.log('✅ Permutator working');

    // 2. Test SMTP (using a domain that might respond, or just checking logic)
    // We'll test a known invalid one to see the 550 or DNS error, and a format check.
    console.log('\n[2] Testing SMTP Verifier...');
    const invalidResult = await verifyEmail('invalid-user-12345@gmail.com');
    console.log('SMTP Check (Invalid User):', invalidResult);

    // 3. Test Supabase Connection
    console.log('\n[3] Testing Supabase Connection...');
    const { data, error } = await supabase.from('profiles').select('count', { count: 'exact', head: true });
    if (error) {
        console.error('❌ Supabase Error:', error.message);
    } else {
        console.log('✅ Supabase Connected. Profile Count:', data); // count is in count property usually
    }

    // 4. Test Main API (with expectation of scrape failure)
    console.log('\n[4] Testing Main API Pipeline...');
    const request = { role: 'Marketing Director', company: 'Nike' };
    try {
        const results = await handleSearchRequest(request);
        console.log('API Results:', results);
    } catch (e) {
        console.log('API Error (Expected if scraping fails):', e);
    }
}

runTest();
