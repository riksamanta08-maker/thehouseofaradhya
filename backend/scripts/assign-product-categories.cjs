require('dotenv').config({ path: '.env.production.local', override: true });

const { getPrisma, disconnect } = require('../src/db/prismaClient');

const CATEGORY_COLLECTIONS = [
  { handle: 'shirts', title: 'Shirts', descriptionHtml: 'Shirts from The House of Aradhya.' },
  { handle: 't-shirts', title: 'T-Shirts', descriptionHtml: 'T-shirts and polos from The House of Aradhya.' },
  { handle: 'pants', title: 'Pants', descriptionHtml: 'Pants, chinos, and trousers from The House of Aradhya.' },
  { handle: 'trouser', title: 'Trouser', descriptionHtml: 'Trousers and smart bottoms from The House of Aradhya.' },
  { handle: 'shoes', title: 'Shoes', descriptionHtml: 'Shoes and footwear from The House of Aradhya.' },
  { handle: 'sneakers', title: 'Sneakers', descriptionHtml: 'Sneakers from The House of Aradhya.' },
  { handle: 'shop', title: 'Shop', descriptionHtml: 'All shoppable Aradhya products.' },
];

const CATEGORY_HANDLES = CATEGORY_COLLECTIONS.map((collection) => collection.handle);

const CURATED_COLLECTIONS = [
  {
    sourceHandle: 'neutral-skin-date-wear',
    aliasHandle: 'neutral-skin-casual-wear',
    skintone: 'neutral',
    title: 'Casual wear',
  },
  {
    sourceHandle: 'fair-skin-date-wear',
    aliasHandle: 'fair-skin-casual-wear',
    skintone: 'fair',
    title: 'Casual wear',
  },
  {
    sourceHandle: 'dark-skin-date-wear',
    aliasHandle: 'dark-skin-casual-wear',
    skintone: 'dark',
    title: 'Casual wear',
  },
];

const norm = (value) => String(value || '').toLowerCase();
const tokensFor = (product) => {
  const raw = [
    product.title,
    product.handle,
    product.productType,
    product.category,
    product.apparelType,
    ...(Array.isArray(product.tags) ? product.tags : []),
  ].map(norm).join(' ');
  return raw.split(/[^a-z0-9]+/).filter(Boolean);
};

const hasToken = (tokens, values) => values.some((value) => tokens.includes(value));

const isComboProduct = (product) => {
  const title = norm(product.title);
  const handle = norm(product.handle);
  const type = norm(product.productType);
  const collectionHandles = (product.collections || [])
    .map((item) => item.collection?.handle)
    .filter(Boolean);
  const hasCuratedSkinOccasionCollection = collectionHandles.some((handleValue) =>
    /^(fair|neutral|dark)-skin-(date|office|puja)-wear$/.test(handleValue),
  );

  return (
    title.includes('combo') ||
    handle.includes('combo') ||
    type.includes(',') ||
    type.includes('combo') ||
    type.includes('bundle') ||
    type.includes('set') ||
    ((title.startsWith('aradhya ') || handle.startsWith('aradhya-')) && hasCuratedSkinOccasionCollection)
  );
};

const inferCategory = (product) => {
  if (isComboProduct(product)) return null;

  const tokens = tokensFor(product);
  const title = norm(product.title);
  const handle = norm(product.handle);
  const titleHandle = `${title} ${handle}`;

  if (
    hasToken(tokensFor({ ...product, productType: '', category: '', tags: [] }), ['shirt', 'shirts']) &&
    !titleHandle.includes('t-shirt') &&
    !titleHandle.includes('tshirt') &&
    !titleHandle.includes('polo')
  ) {
    return {
      productType: 'Shirt',
      apparelType: 'TOP',
      category: 'shirts',
      collections: ['shirts', 'shop'],
    };
  }

  if (hasToken(tokens, ['sneaker', 'sneakers'])) {
    return {
      productType: 'Sneakers',
      apparelType: 'SHOES',
      category: 'sneakers',
      collections: ['sneakers', 'shoes', 'shop'],
    };
  }

  if (hasToken(tokens, ['shoe', 'shoes', 'footwear'])) {
    return {
      productType: 'Shoes',
      apparelType: 'SHOES',
      category: 'shoes',
      collections: ['shoes', 'shop'],
    };
  }

  if (
    hasToken(tokens, ['tshirt', 'tee', 'polo']) ||
    titleHandle.includes('t-shirt') ||
    titleHandle.includes('tshirt')
  ) {
    return {
      productType: 'T-Shirt',
      apparelType: 'TOP',
      category: 't-shirts',
      collections: ['t-shirts', 'shop'],
    };
  }

  if (hasToken(tokens, ['pant', 'pants', 'chino', 'chinos', 'trouser', 'trousers'])) {
    return {
      productType: hasToken(tokens, ['linen']) ? 'Linen Pant' : 'Pant',
      apparelType: 'BOTTOM',
      category: 'trouser',
      collections: ['pants', 'trouser', 'shop'],
    };
  }

  return null;
};

const ensureCollection = async (prisma, data) => {
  const existing = await prisma.collection.findUnique({ where: { handle: data.handle } });
  if (existing) return existing;
  return prisma.collection.create({
    data: {
      handle: data.handle,
      title: data.title,
      descriptionHtml: data.descriptionHtml,
      type: 'MANUAL',
      publishedAt: new Date(),
    },
  });
};

const ensureCuratedCollectionAlias = async (prisma, source, alias) => {
  const sourceCollection = await prisma.collection.findUnique({
    where: { handle: source.sourceHandle },
    select: { id: true, descriptionHtml: true, imageUrl: true },
  });

  if (!sourceCollection) return null;

  const existing = await prisma.collection.findUnique({ where: { handle: source.aliasHandle } });
  if (existing) {
    await prisma.collection.update({
      where: { id: existing.id },
      data: {
        title: source.title,
        descriptionHtml: existing.descriptionHtml || sourceCollection.descriptionHtml,
        imageUrl: existing.imageUrl || sourceCollection.imageUrl,
        rules: {
          storefrontFlow: {
            enabled: true,
            skintones: [source.skintone],
            occasions: ['casual', 'date'],
          },
        },
        publishedAt: existing.publishedAt || new Date(),
      },
    });
    return existing;
  }

  return prisma.collection.create({
    data: {
      handle: source.aliasHandle,
      title: source.title,
      descriptionHtml: sourceCollection.descriptionHtml,
      imageUrl: sourceCollection.imageUrl,
      type: 'MANUAL',
      rules: {
        storefrontFlow: {
          enabled: true,
          skintones: [source.skintone],
          occasions: ['casual', 'date'],
        },
      },
      publishedAt: new Date(),
    },
  });
};

const syncCuratedCollectionAliases = async (prisma) => {
  const summary = {
    aliasesEnsured: 0,
    aliasLinksCreated: 0,
    dateLinksCreated: 0,
  };

  for (const source of CURATED_COLLECTIONS) {
    const sourceCollection = await prisma.collection.findUnique({
      where: { handle: source.sourceHandle },
      select: {
        id: true,
        products: {
          select: {
            productId: true,
            position: true,
          },
        },
      },
    });
    if (!sourceCollection) continue;

    const aliasCollection = await ensureCuratedCollectionAlias(prisma, source);
    if (!aliasCollection) continue;
    summary.aliasesEnsured += 1;

    const aliasLinks = await prisma.productCollection.findMany({
      where: { collectionId: aliasCollection.id },
      select: { productId: true },
    });
    const aliasProductIds = new Set(aliasLinks.map((item) => item.productId));

    for (const sourceLink of sourceCollection.products) {
      if (aliasProductIds.has(sourceLink.productId)) continue;
      await prisma.productCollection.create({
        data: {
          productId: sourceLink.productId,
          collectionId: aliasCollection.id,
          position: sourceLink.position,
        },
      });
      summary.aliasLinksCreated += 1;
    }

    const currentAliasLinks = await prisma.productCollection.findMany({
      where: { collectionId: aliasCollection.id },
      select: { productId: true, position: true },
    });
    const sourceProductIds = new Set(sourceCollection.products.map((item) => item.productId));
    for (const aliasLink of currentAliasLinks) {
      if (sourceProductIds.has(aliasLink.productId)) continue;
      await prisma.productCollection.create({
        data: {
          productId: aliasLink.productId,
          collectionId: sourceCollection.id,
          position: aliasLink.position,
        },
      });
      summary.dateLinksCreated += 1;
    }

  }

  return summary;
};

const normalizeOfficeTags = async (prisma) => {
  return { productsTagged: 0 };
};

async function main() {
  const prisma = await getPrisma();
  const collectionsByHandle = new Map();

  for (const collection of CATEGORY_COLLECTIONS) {
    const record = await ensureCollection(prisma, collection);
    collectionsByHandle.set(record.handle, record);
  }

  const products = await prisma.product.findMany({
    select: {
      id: true,
      title: true,
      handle: true,
      productType: true,
      apparelType: true,
      category: true,
      tags: true,
      collections: {
        select: {
          collectionId: true,
          collection: {
            select: { handle: true, title: true },
          },
        },
      },
    },
  });

  const summary = {
    productsScanned: products.length,
    productsUpdated: 0,
    collectionLinksCreated: 0,
    skipped: 0,
    comboCategoryLinksRemoved: 0,
    curatedAliases: null,
    officeTags: null,
  };

  for (const product of products) {
    if (isComboProduct(product)) {
      const categoryLinks = product.collections.filter((item) =>
        CATEGORY_HANDLES.includes(item.collection?.handle),
      );
      if (categoryLinks.length) {
        await prisma.productCollection.deleteMany({
          where: {
            productId: product.id,
            collectionId: { in: categoryLinks.map((item) => item.collectionId) },
          },
        });
        summary.comboCategoryLinksRemoved += categoryLinks.length;
      }

      if (CATEGORY_HANDLES.includes(product.category)) {
        await prisma.product.update({
          where: { id: product.id },
          data: {
            category: null,
            apparelType: null,
            productType: product.title.toLowerCase().includes('tshirt') ? 'Tshirt,pant,Sneakers' : 'Shirt,Pant,Shoes',
          },
        });
        summary.productsUpdated += 1;
      }
      continue;
    }

    const inferred = inferCategory(product);
    if (!inferred) {
      summary.skipped += 1;
      continue;
    }

    const nextTags = (Array.isArray(product.tags) ? product.tags : []).filter(
      (tag) => !CATEGORY_HANDLES.includes(norm(tag)),
    );
    const updates = {
      productType: inferred.productType,
      apparelType: inferred.apparelType,
      category: inferred.category,
      tags: nextTags,
    };

    await prisma.product.update({
      where: { id: product.id },
      data: updates,
    });
    summary.productsUpdated += 1;

    const existingHandles = new Set(
      product.collections
        .map((item) => item.collection?.handle)
        .filter(Boolean),
    );

    const staleCategoryLinks = product.collections.filter((item) => {
      const handle = item.collection?.handle;
      return CATEGORY_HANDLES.includes(handle) && !inferred.collections.includes(handle);
    });
    if (staleCategoryLinks.length) {
      await prisma.productCollection.deleteMany({
        where: {
          productId: product.id,
          collectionId: { in: staleCategoryLinks.map((item) => item.collectionId) },
        },
      });
    }

    for (const handle of inferred.collections) {
      if (existingHandles.has(handle)) continue;
      const collection = collectionsByHandle.get(handle);
      if (!collection) continue;
      await prisma.productCollection.create({
        data: {
          productId: product.id,
          collectionId: collection.id,
        },
      });
      summary.collectionLinksCreated += 1;
    }
  }

  summary.curatedAliases = await syncCuratedCollectionAliases(prisma);
  summary.officeTags = await normalizeOfficeTags(prisma);

  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch((error) => {
    console.error('Failed to assign product categories:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnect().catch(() => {});
  });
