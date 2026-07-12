const http = require('http');

const PORT = 5000;
const BASE_URL = `http://localhost:${PORT}/api`;

function fetchJson(path) {
    return new Promise((resolve, reject) => {
        http.get(`${BASE_URL}${path}`, (res) => {
            let data = '';
            res.on('data', (chunk) => (data += chunk));
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    resolve({ status: res.statusCode, data: json });
                } catch (e) {
                    reject(e);
                }
            });
        }).on('error', reject);
    });
}

async function verify() {
    console.log('Starting verification...');

    try {
        // 1. Test Collection Pagination
        console.log('\n--- Testing Collection Pagination ---');
        const page1 = await fetchJson('/collections?limit=1&page=1');
        const page2 = await fetchJson('/collections?limit=1&page=2');

        if (page1.status !== 200 || page2.status !== 200) {
            console.error('Failed to fetch collections');
            return;
        }

        const id1 = page1.data.data[0]?.id;
        const id2 = page2.data.data[0]?.id;

        console.log(`Page 1 ID: ${id1}`);
        console.log(`Page 2 ID: ${id2}`);

        if (id1 && id2 && id1 !== id2) {
            console.log('✅ Collection pagination works: IDs are different.');
        } else {
            console.error('❌ Collection pagination failed: IDs are same or missing.');
        }

        if (page1.data.meta && page1.data.meta.page === 1 && page1.data.meta.limit === 1) {
            console.log('✅ Collection metadata correct.');
        } else {
            console.error('❌ Collection metadata incorrect:', page1.data.meta);
        }

        // 2. Test Product skipCount
        console.log('\n--- Testing Product skipCount ---');
        const productsNoCount = await fetchJson('/products?limit=1&skipCount=true');
        const productsWithCount = await fetchJson('/products?limit=1');

        if (productsNoCount.status !== 200 || productsWithCount.status !== 200) {
            console.error('Failed to fetch products');
            return;
        }

        const totalNoCount = productsNoCount.data.meta?.total;
        const totalWithCount = productsWithCount.data.meta?.total;

        console.log(`Total (skipCount=true): ${totalNoCount}`);
        console.log(`Total (default): ${totalWithCount}`);

        if (totalNoCount === -1) {
            console.log('✅ Product skipCount works: total is -1.');
        } else {
            console.error('❌ Product skipCount failed: total is not -1.');
        }

        if (typeof totalWithCount === 'number' && totalWithCount >= 0) {
            console.log('✅ Product default count works: total is a number.');
        } else {
            console.error('❌ Product default count failed.');
        }

    } catch (error) {
        console.error('Verification failed:', error);
    }
}

verify();
