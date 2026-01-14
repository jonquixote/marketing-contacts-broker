import axios from 'axios';
import * as dotenv from 'dotenv';

dotenv.config();

async function testPhoneSearch() {
    const name = "Dean Gomes";
    const company = "Nike";
    const query = `"${name}" "${company}" (phone OR mobile OR contact) -site:linkedin.com`;
    console.log(`Testing Phone Search: ${query}`);

    try {
        const res = await axios.get('https://www.googleapis.com/customsearch/v1', {
            params: {
                key: process.env.GOOGLE_API_KEY,
                cx: process.env.GOOGLE_CX,
                q: query,
                num: 5
            }
        });

        if (res.data.items) {
            res.data.items.forEach((item: any, index: number) => {
                console.log(`\n--- Result ${index + 1} ---`);
                console.log('Title:', item.title);
                console.log('Snippet:', item.snippet);

                const phoneMatch = item.snippet?.match(/(\+\d{1,2}\s)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/);
                if (phoneMatch) {
                    console.log('>>> FOUND PHONE:', phoneMatch[0]);
                }
            });
        } else {
            console.log('No results found.');
        }
    } catch (error) {
        console.error('API Error:', (error as any).message);
    }
}

testPhoneSearch();
