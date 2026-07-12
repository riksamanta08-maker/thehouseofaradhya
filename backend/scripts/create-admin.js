#!/usr/bin/env node
/* Create or promote an admin user.
 *
 * Usage:
 *   node scripts/create-admin.js --email you@example.com --password "Secret123" --name "Admin User"
 *   EMAIL=you@example.com PASSWORD=Secret123 NAME="Admin User" node scripts/create-admin.js
 */
require('dotenv').config({ override: true });
const bcrypt = require('bcrypt');
const { getPrisma, disconnect } = require('../src/db/prismaClient');

const args = process.argv.slice(2).reduce((acc, arg) => {
  const [key, ...rest] = arg.replace(/^--/, '').split('=');
  const value = rest.length ? rest.join('=') : true;
  acc[key] = value;
  return acc;
}, {});

const email = process.env.EMAIL || args.email;
const password = process.env.PASSWORD || args.password;
const name = process.env.NAME || args.name || 'Admin User';

const fail = (msg) => {
  console.error(msg);
  process.exit(1);
};

if (!email) fail('Missing --email or EMAIL env');
if (!password || String(password).length < 6) fail('Missing --password (min 6 chars) or PASSWORD env');

async function main() {
  const prisma = await getPrisma();

  const existing = await prisma.user.findUnique({ where: { email } });
  const passwordHash = await bcrypt.hash(password, 10);

  if (existing) {
    const updated = await prisma.user.update({
      where: { email },
      data: {
        name: existing.name || name,
        role: 'ADMIN',
        passwordHash,
      },
    });
    console.log(`Updated user ${updated.email} to ADMIN`);
    return;
  }

  const created = await prisma.user.create({
    data: {
      email,
      name,
      role: 'ADMIN',
      passwordHash,
    },
  });
  console.log(`Created admin user ${created.email}`);
}

main()
  .catch((err) => {
    console.error('Failed to create admin:', err.message || err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnect().catch(() => {});
  });
