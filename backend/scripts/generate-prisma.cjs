// Run this script to generate Prisma client with DATABASE_URL from .env
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Read .env file manually
const envPath = path.join(__dirname, '..', '.env');
const envContent = fs.readFileSync(envPath, 'utf8');

// Parse DATABASE_URL
const match = envContent.match(/DATABASE_URL="?([^"\n]*)"?/);
if (!match) {
    console.error('DATABASE_URL not found in .env');
    process.exit(1);
}

const databaseUrl = match[1];
console.log('Found DATABASE_URL, generating Prisma client...');

// Set environment and run prisma generate
const env = { ...process.env, DATABASE_URL: databaseUrl };

try {
    execSync('npx prisma generate', {
        stdio: 'inherit',
        env,
        cwd: path.join(__dirname, '..')
    });
    console.log('✅ Prisma client generated successfully!');
} catch (error) {
    console.error('❌ Failed to generate Prisma client:', error.message);
    process.exit(1);
}
