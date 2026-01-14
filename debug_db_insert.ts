import { supabase } from './functions/utils/supabase';

async function testInsert() {
    console.log('--- Testing DB Insert ---');

    const testProfile = {
        name: 'Test User',
        normalized_title: 'Test Title',
        company: 'Test Company',
        linkedin_url: 'https://linkedin.com/in/test-user-' + Date.now(),
        last_verified_at: new Date().toISOString(),
        // status: 'active',
        raw_data: { note: 'This is a test', row_status: 'active' }
    };

    console.log('Attempting to insert:', testProfile);

    const { data, error } = await supabase
        .from('profiles')
        .upsert([testProfile], { onConflict: 'linkedin_url' })
        .select();

    if (error) {
        console.error('DB Insert Failed:', error);
    } else {
        console.log('DB Insert Success:', data);
    }
}

testInsert();
