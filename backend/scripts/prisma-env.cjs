// Helper script to run Prisma commands with environment loaded
require('dotenv').config({ override: true });
const { execSync } = require('child_process');

const command = process.argv.slice(2).join(' ');
console.log(`Running: npx prisma ${command}`);

try {
    execSync(`npx prisma ${command}`, {
        stdio: 'inherit',
        env: { ...process.env }
    });
} catch (error) {
    process.exit(error.status || 1);
}
