import express from 'express';
import path from 'path';
import { handleSearchRequest } from './functions/api/search';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware to parse JSON bodies
app.use(express.json());

// Serve static files from 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// API Endpoint
app.post('/api/search', async (req, res) => {
    try {
        const { type, role, company, businessType, location } = req.body;

        if (!type) {
            return res.status(400).json({ error: 'Missing search type' });
        }

        console.log(`[Server] Search Request: ${type} - ${role || businessType} at ${company || location}`);

        // @ts-ignore - Simple pass through of the body which matches the interface at runtime
        const results = await handleSearchRequest({ type, role, company, businessType, location });

        res.json(results);
    } catch (error: any) {
        console.error('[Server] Error:', error);
        res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
});

// Recent Discoveries Endpoint
import { supabase } from './functions/utils/supabase';

app.get('/api/recent', async (req, res) => {
    try {
        const { data: profiles, error } = await supabase
            .from('profiles')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(20);

        if (error) throw error;

        const enriched = profiles.map(p => ({
            name: p.name,
            headline: p.normalized_title, // This is actually the bio/headline
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

        res.json(enriched);
    } catch (error: any) {
        console.error('[Server] Recent Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Start Server
app.listen(PORT, () => {
    console.log(`\n🚀 Server running at http://localhost:${PORT}`);
    console.log(`   - Frontend: http://localhost:${PORT}`);
    console.log(`   - API:      http://localhost:${PORT}/api/search`);
});
