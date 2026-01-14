import axios from 'axios';
import * as dotenv from 'dotenv';

dotenv.config();

async function testGoogleApi() {
    const query = 'site:linkedin.com/in ("Marketing Director" OR "Head of Marketing") "Nike"';
    console.log(`Testing Query: ${query}`);

    try {
        const res = await axios.get('https://www.googleapis.com/customsearch/v1', {
            params: {
                key: process.env.GOOGLE_API_KEY,
                cx: process.env.GOOGLE_CX,
                q: query,
                num: 3 // Just need a few to check structure
            }
        });

        if (res.data.items) {
            res.data.items.forEach((item: any, index: number) => {
                console.log(`\n--- Result ${index + 1} ---`);
                console.log('Title:', item.title);
                console.log('Link:', item.link);
                console.log('Snippet:', item.snippet);
                console.log('Pagemap:', JSON.stringify(item.pagemap, null, 2));
            });
        } else {
            console.log('No results found.');
        }
    } catch (error) {
        console.error('API Error:', (error as any).message);
    }
}

testGoogleApi();
