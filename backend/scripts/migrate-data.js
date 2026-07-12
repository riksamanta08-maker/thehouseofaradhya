/**
 * Migrate all data from old Neon DB to new Neon DB.
 * Usage: node scripts/migrate-data.js
 */
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

const OLD_DB_URL =
    'postgresql://neondb_owner:npg_i6MBRA0LEjkS@ep-hidden-mode-ahnlog9f-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

const NEW_DB_URL =
    'postgresql://neondb_owner:npg_d0IjZD4EOyMf@ep-steep-tooth-a1t2haht-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

function createClient(connectionString, label) {
    const adapter = new PrismaPg({ connectionString });
    const client = new PrismaClient({ adapter });
    console.log(`[${label}] Client created`);
    return client;
}

// Tables in dependency order (parents before children)
const MIGRATION_ORDER = [
    { name: 'User', key: 'user' },
    { name: 'Collection', key: 'collection' },
    { name: 'Product', key: 'product' },
    { name: 'ProductCollection', key: 'productCollection' },
    { name: 'ProductMedia', key: 'productMedia' },
    { name: 'ProductOption', key: 'productOption' },
    { name: 'ProductVariant', key: 'productVariant' },
    { name: 'Location', key: 'location' },
    { name: 'InventoryLevel', key: 'inventoryLevel' },
    { name: 'SalesChannel', key: 'salesChannel' },
    { name: 'ProductPublication', key: 'productPublication' },
    { name: 'Metaobject', key: 'metaobject' },
    { name: 'ProductMetafield', key: 'productMetafield' },
    { name: 'VariantMetafield', key: 'variantMetafield' },
    { name: 'CollectionMetafield', key: 'collectionMetafield' },
    { name: 'Review', key: 'review' },
    { name: 'ReviewMedia', key: 'reviewMedia' },
    { name: 'PasswordResetToken', key: 'passwordResetToken' },
    { name: 'Order', key: 'order' },
    { name: 'OrderItem', key: 'orderItem' },
    { name: 'Address', key: 'address' },
];

async function migrateTable(oldPrisma, newPrisma, table) {
    const { name, key } = table;
    try {
        const rows = await oldPrisma[key].findMany();
        if (!rows.length) {
            console.log(`  [${name}] 0 rows — skipping`);
            return 0;
        }

        // Insert rows one-by-one to handle potential constraint issues gracefully
        let inserted = 0;
        let skipped = 0;
        for (const row of rows) {
            try {
                await newPrisma[key].create({ data: row });
                inserted++;
            } catch (err) {
                if (err.code === 'P2002') {
                    // Duplicate — already exists
                    skipped++;
                } else {
                    console.warn(`  [${name}] Row error:`, err.message);
                    skipped++;
                }
            }
        }
        console.log(`  [${name}] ${inserted} inserted, ${skipped} skipped (of ${rows.length} total)`);
        return inserted;
    } catch (err) {
        console.error(`  [${name}] FAILED:`, err.message);
        return 0;
    }
}

async function main() {
    console.log('=== Data Migration: Old Neon → New Neon ===\n');

    const oldPrisma = createClient(OLD_DB_URL, 'OLD');
    const newPrisma = createClient(NEW_DB_URL, 'NEW');

    try {
        // Verify connections
        console.log('\nConnecting to OLD DB...');
        await oldPrisma.$queryRawUnsafe('SELECT 1');
        console.log('✅ OLD DB connected');

        console.log('Connecting to NEW DB...');
        await newPrisma.$queryRawUnsafe('SELECT 1');
        console.log('✅ NEW DB connected\n');

        console.log('--- Starting migration ---\n');
        const start = Date.now();
        let totalInserted = 0;

        for (const table of MIGRATION_ORDER) {
            const count = await migrateTable(oldPrisma, newPrisma, table);
            totalInserted += count;
        }

        const duration = ((Date.now() - start) / 1000).toFixed(1);
        console.log(`\n--- Migration complete ---`);
        console.log(`Total rows inserted: ${totalInserted}`);
        console.log(`Duration: ${duration}s`);
    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        await oldPrisma.$disconnect();
        await newPrisma.$disconnect();
    }
}

main();
