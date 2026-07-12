require('dotenv').config({ path: '.env.production.local', override: true });

const fs = require('node:fs');
const path = require('node:path');
const { getPrisma, disconnect } = require('../src/db/prismaClient');

const DEFAULT_CSV_PATH = 'C:\\Users\\zafar\\Downloads\\products-export.csv';

const parseCsv = (text) => {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (char !== '\r') {
      cell += char;
    }
  }

  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }

  const headers = rows.shift() || [];
  return rows
    .filter((values) => values.some((value) => String(value || '').trim() !== ''))
    .map((values) =>
      headers.reduce((record, header, index) => {
        record[header] = values[index] ?? '';
        return record;
      }, {}),
    );
};

const splitTags = (value) =>
  String(value || '')
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);

const countRowsByTag = (productsByHandle) => {
  const counts = {};
  for (const product of productsByHandle.values()) {
    for (const tag of product.tags) {
      counts[tag] = (counts[tag] || 0) + product.rowCount;
    }
  }
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
};

async function main() {
  const csvPath = path.resolve(process.argv[2] || DEFAULT_CSV_PATH);
  const csv = fs.readFileSync(csvPath, 'utf8');
  const rows = parseCsv(csv);
  const productsByHandle = new Map();

  for (const row of rows) {
    const handle = String(row.Handle || '').trim();
    if (!handle) continue;

    if (!productsByHandle.has(handle)) {
      productsByHandle.set(handle, {
        handle,
        rowCount: 0,
        tags: [],
      });
    }

    const product = productsByHandle.get(handle);
    product.rowCount += 1;
    if (!product.tags.length && String(row.Tags || '').trim()) {
      product.tags = splitTags(row.Tags);
    }
  }

  const prisma = await getPrisma();
  const summary = {
    csvPath,
    csvRows: rows.length,
    csvProducts: productsByHandle.size,
    updated: 0,
    missing: [],
    expectedTaggedRows: countRowsByTag(productsByHandle),
  };

  for (const product of productsByHandle.values()) {
    const existing = await prisma.product.findUnique({
      where: { handle: product.handle },
      select: { id: true, tags: true },
    });

    if (!existing) {
      summary.missing.push(product.handle);
      continue;
    }

    const current = JSON.stringify(existing.tags || []);
    const next = JSON.stringify(product.tags);
    if (current === next) continue;

    await prisma.product.update({
      where: { id: existing.id },
      data: { tags: product.tags },
    });
    summary.updated += 1;
  }

  const dbProducts = await prisma.product.findMany({
    select: {
      handle: true,
      tags: true,
      _count: { select: { variants: true } },
    },
  });
  const handlesInCsv = new Set(productsByHandle.keys());
  const actualTaggedRows = {};
  for (const product of dbProducts) {
    if (!handlesInCsv.has(product.handle)) continue;
    for (const tag of product.tags || []) {
      actualTaggedRows[tag] = (actualTaggedRows[tag] || 0) + product._count.variants;
    }
  }

  summary.actualTaggedRows = Object.fromEntries(
    Object.entries(actualTaggedRows).sort(([a], [b]) => a.localeCompare(b)),
  );

  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch((error) => {
    console.error('Failed to sync product tags from CSV:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnect().catch(() => {});
  });
