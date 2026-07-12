const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const dotenv = require('dotenv');
const path = require('node:path');

dotenv.config({ path: path.resolve(__dirname, '../.env'), override: true });

const url = process.env.DATABASE_URL;
if (!url) {
    throw new Error('DATABASE_URL is not set');
}
const adapter = new PrismaPg({ connectionString: url });
const p = new PrismaClient({ adapter });

async function verify() {
    const tables = ['user', 'product', 'collection', 'productVariant', 'productMedia', 'productOption', 'productCollection', 'order', 'review', 'location', 'inventoryLevel'];
    console.log('=== NEW DB Row Counts ===');
    for (const t of tables) {
        try {
            const count = await p[t].count();
            console.log(`  ${t}: ${count}`);
        } catch (e) {
            console.log(`  ${t}: ERROR - ${e.message}`);
        }
    }
    await p.$disconnect();
}
verify();
