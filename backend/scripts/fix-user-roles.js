const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

async function main() {
    const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
    const prisma = new PrismaClient({ adapter });

    // Fix lowercase role values to uppercase enum values
    const updates = [
        { from: 'admin', to: 'ADMIN' },
        { from: 'customer', to: 'CUSTOMER' },
        { from: 'vendor', to: 'VENDOR' },
    ];

    for (const { from, to } of updates) {
        try {
            const result = await prisma.$executeRawUnsafe(
                `UPDATE "User" SET role = '${to}'::"Role" WHERE role = '${from}'::"Role"`
            );
            if (result > 0) console.log(`Updated ${result} user(s): ${from} → ${to}`);
        } catch (e) {
            // If the old value doesn't exist in enum, try text cast
            try {
                const result2 = await prisma.$executeRawUnsafe(
                    `UPDATE "User" SET role = '${to}' WHERE role::text = '${from}'`
                );
                if (result2 > 0) console.log(`Updated ${result2} user(s) (text cast): ${from} → ${to}`);
            } catch (e2) {
                console.log(`No users with role '${from}' or already correct`);
            }
        }
    }

    // Verify
    const users = await prisma.$queryRawUnsafe('SELECT email, role FROM "User" LIMIT 20');
    console.log('\nUsers after fix:');
    users.forEach(u => console.log(`  ${u.email} → ${u.role}`));

    // Test Prisma ORM
    try {
        const ormUsers = await prisma.user.findMany({
            select: { email: true, role: true }
        });
        console.log('\nPrisma ORM works! Users:', ormUsers.length);
    } catch (e) {
        console.error('\nPrisma ORM still failing:', e.message);
    }

    await prisma.$disconnect();
}

main().catch(console.error);
