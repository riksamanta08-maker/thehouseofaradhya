const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

async function main() {
    const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
    const prisma = new PrismaClient({ adapter });

    // Check actual column type
    const colInfo = await prisma.$queryRawUnsafe(`
    SELECT column_name, data_type, udt_name 
    FROM information_schema.columns 
    WHERE table_name = 'User' AND column_name = 'role'
  `);
    console.log('Column info:', JSON.stringify(colInfo));

    // Check what enum values exist
    const enumValues = await prisma.$queryRawUnsafe(`
    SELECT e.enumlabel 
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'Role'
    ORDER BY e.enumsortorder
  `);
    console.log('Enum values:', enumValues.map(e => e.enumlabel));

    // See actual data (cast to text to avoid enum errors)
    const users = await prisma.$queryRawUnsafe(`
    SELECT id, email, role::text as role_text FROM "User" LIMIT 10
  `);
    console.log('\nUsers:');
    users.forEach(u => console.log(`  ${u.email} | role_text: "${u.role_text}"`));

    await prisma.$disconnect();
}

main().catch(console.error);
