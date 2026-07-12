const { PrismaClient } = require('@prisma/client');
const path = require('node:path');
const dotenv = require('dotenv');

// Load environment variables from .env.production.local
dotenv.config({ path: path.resolve(__dirname, '../.env.production.local'), override: true });

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  console.log('Connecting to database:', dbUrl ? dbUrl.split('@')[1] : '(none)');
  
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: dbUrl
      }
    }
  });

  try {
    const count = await prisma.product.count();
    console.log('Total products in database:', count);
    
    const products = await prisma.product.findMany({
      take: 5,
      select: {
        id: true,
        title: true,
        handle: true,
        status: true
      }
    });
    
    console.log('First 5 products:');
    console.log(JSON.stringify(products, null, 2));
  } catch (err) {
    console.error('Database connection failed:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
