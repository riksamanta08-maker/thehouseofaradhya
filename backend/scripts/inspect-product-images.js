const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

const SINGAPORE_DB_URL = 'postgresql://neondb_owner:npg_d0IjZD4EOyMf@ep-steep-tooth-a1t2haht-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=prefer&pgbouncer=true&connect_timeout=15';

async function main() {
  try {
    const adapter = new PrismaPg({ connectionString: SINGAPORE_DB_URL });
    const prisma = new PrismaClient({ adapter });

    const products = await prisma.product.findMany({
      take: 10,
      select: {
        title: true,
        media: {
          select: {
            url: true,
            type: true,
          },
        },
      },
    });

    console.log('=== Product Images in Singapore DB ===');
    products.forEach((p) => {
      console.log(`Product: "${p.title}"`);
      if (p.media.length === 0) {
        console.log('  No media found.');
      } else {
        p.media.forEach((m) => {
          console.log(`  - [${m.type}] URL: ${m.url}`);
        });
      }
    });

    await prisma.$disconnect();
  } catch (error) {
    console.error('Failed to query product images:', error);
  }
}

main();
