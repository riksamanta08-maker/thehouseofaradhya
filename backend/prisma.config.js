/* Prisma 7+ datasource config */
const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '.env'), override: true });
const { defineConfig } = require('prisma/config');

module.exports = defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
