#!/usr/bin/env node
require('dotenv').config({ override: true });
const { getPrisma, disconnect } = require('../src/db/prismaClient');

const cartesian = (arrays) =>
  arrays.reduce(
    (acc, list) => acc.flatMap((prev) => list.map((value) => [...prev, value])),
    [[]],
  );

const buildVariants = (options, base) => {
  const names = options.map((opt) => opt.name);
  const combos = cartesian(options.map((opt) => opt.values));
  return combos.map((combo) => {
    const optionValues = {};
    names.forEach((name, index) => {
      optionValues[name] = String(combo[index]);
    });
    const skuSuffix = combo.map((value) => String(value).replace(/\s+/g, '').toUpperCase()).join('-');
    return {
      optionValues,
      sku: base.skuPrefix ? `${base.skuPrefix}-${skuSuffix}` : undefined,
      price: base.price,
      compareAtPrice: base.compareAtPrice,
      inventory: { available: base.inventory ?? 10 },
      trackInventory: true,
      taxable: true,
      inventoryPolicy: 'DENY',
      requiresShipping: true,
    };
  });
};

const ensureCollection = async (prisma, data) => {
  const existing = await prisma.collection.findUnique({ where: { handle: data.handle } });
  if (existing) return existing;
  return prisma.collection.create({ data });
};

const ensureLocation = async (prisma, name) => {
  const existing = await prisma.location.findFirst({ where: { name } });
  if (existing) return existing;
  return prisma.location.create({ data: { name } });
};

const buildVariantTitle = (variant, optionOrder) => {
  if (variant.title) return variant.title;
  if (!variant.optionValues || !optionOrder?.length) return 'Default';
  const parts = optionOrder
    .map((name) => variant.optionValues[name])
    .filter((value) => value && String(value).trim() !== '');
  return parts.length ? parts.join(' / ') : 'Default';
};

const createProductWithRelations = async (prisma, payload) => {
  const existing = await prisma.product.findUnique({ where: { handle: payload.handle } });
  if (existing) return existing;

  const product = await prisma.product.create({
    data: {
      title: payload.title,
      handle: payload.handle,
      descriptionHtml: payload.descriptionHtml,
      status: payload.status || 'ACTIVE',
      vendor: payload.vendor,
      productType: payload.productType,
      category: payload.category,
      apparelType: payload.apparelType,
      tags: payload.tags || [],
      publishedAt: payload.publishedAt || new Date(),
    },
  });

  const productId = product.id;

  if (payload.collectionIds?.length) {
    await prisma.productCollection.createMany({
      data: payload.collectionIds.map((collectionId, index) => ({
        productId,
        collectionId,
        position: index + 1,
      })),
    });
  }

  if (payload.media?.length) {
    await prisma.productMedia.createMany({
      data: payload.media.map((media, index) => ({
        productId,
        url: media.url,
        alt: media.alt || null,
        type: media.type || 'IMAGE',
        position: media.position ?? index,
      })),
    });
  }

  if (payload.options?.length) {
    await prisma.productOption.createMany({
      data: payload.options.map((option, index) => ({
        productId,
        name: option.name,
        values: option.values,
        position: index + 1,
      })),
    });
  }

  const mediaRecords = payload.media?.length
    ? await prisma.productMedia.findMany({ where: { productId } })
    : [];
  const mediaByUrl = new Map(mediaRecords.map((record) => [record.url, record.id]));
  const optionOrder = payload.options ? payload.options.map((opt) => opt.name) : [];

  if (payload.variants?.length) {
    for (let i = 0; i < payload.variants.length; i += 1) {
      const variant = payload.variants[i];
      const created = await prisma.productVariant.create({
        data: {
          productId,
          title: buildVariantTitle(variant, optionOrder),
          position: i + 1,
          sku: variant.sku ?? null,
          barcode: variant.barcode ?? null,
          price: variant.price ?? null,
          compareAtPrice: variant.compareAtPrice ?? null,
          costPerItem: variant.costPerItem ?? null,
          unitPrice: variant.unitPrice ?? null,
          unitPriceMeasurement: variant.unitPriceMeasurement ?? null,
          taxable: variant.taxable ?? true,
          trackInventory: variant.trackInventory ?? true,
          inventoryPolicy: variant.inventoryPolicy ?? 'DENY',
          requiresShipping: variant.requiresShipping ?? true,
          weight: variant.weight ?? null,
          weightUnit: variant.weightUnit ?? null,
          originCountryCode: variant.originCountryCode ?? null,
          hsCode: variant.hsCode ?? null,
          optionValues: variant.optionValues ?? undefined,
          imageId: variant.imageUrl ? mediaByUrl.get(variant.imageUrl) : null,
        },
      });

      if (variant.inventory?.available !== undefined && variant.trackInventory !== false) {
        const locationName = variant.inventory.location || 'Default';
        const location = await ensureLocation(prisma, locationName);
        await prisma.inventoryLevel.create({
          data: {
            variantId: created.id,
            locationId: location.id,
            available: variant.inventory.available ?? 0,
            onHand: variant.inventory.available ?? 0,
            committed: 0,
            unavailable: 0,
          },
        });
      }
    }
  }

  if (payload.metafields?.length) {
    await prisma.productMetafield.createMany({
      data: payload.metafields.map((field) => ({
        productId,
        namespace: field.namespace,
        key: field.key,
        type: field.type || 'single_line_text_field',
        value: field.value,
        description: field.description ?? null,
        set: field.set || 'PRODUCT',
      })),
    });
  }

  return product;
};

async function main() {
  const prisma = await getPrisma();

  const combos = await ensureCollection(prisma, {
    handle: 'combos',
    title: 'Combos',
    descriptionHtml: 'Complete looks curated for you.',
  });
  const officeCombos = await ensureCollection(prisma, {
    handle: 'office-combos',
    title: 'Office Combos',
    descriptionHtml: 'Smart office-ready sets.',
    parentId: combos.id,
  });
  const tops = await ensureCollection(prisma, {
    handle: 'tops',
    title: 'Tops',
    descriptionHtml: 'Shirts and tees.',
  });
  const bottoms = await ensureCollection(prisma, {
    handle: 'bottoms',
    title: 'Bottoms',
    descriptionHtml: 'Pants and trousers.',
  });
  const shoes = await ensureCollection(prisma, {
    handle: 'shoes',
    title: 'Shoes',
    descriptionHtml: 'Formal and casual footwear.',
  });

  const comboOptions = [
    { name: 'Size', values: ['S', 'M', 'L', 'XL'] },
    { name: 'Color', values: ['Brown', 'Black'] },
  ];

  const topOptions = [
    { name: 'Size', values: ['S', 'M', 'L', 'XL'] },
    { name: 'Color', values: ['White', 'Blue'] },
  ];

  const bottomOptions = [
    { name: 'Size', values: ['30', '32', '34', '36'] },
  ];

  const shoeOptions = [
    { name: 'Size', values: ['7', '8', '9', '10'] },
  ];

  const products = [
    {
      title: 'Aradhya Expert Combo',
      handle: 'aradhya-expert-combo',
      vendor: 'Aradhya',
      productType: 'Combo',
      apparelType: 'OTHER',
      category: 'Office Wear',
      tags: ['combo', 'featured', 'new'],
      descriptionHtml:
        '<p>Aradhya Expert Combo is designed for a polished office look. This combo includes a shirt, trouser, and shoes curated to work together.</p><ul><li>Premium fabric</li><li>All-day comfort</li><li>Smart office styling</li></ul>',
      collectionIds: [officeCombos.id, combos.id],
      media: [
        { url: '/images/m1.jpg', alt: 'Combo look front' },
        { url: '/images/m2.jpg', alt: 'Combo look back' },
        { url: '/images/m3.jpg', alt: 'Combo details' },
        { url: '/images/m4.jpg', alt: 'Combo accessories' },
      ],
      options: comboOptions,
      variants: buildVariants(comboOptions, {
        price: 2500,
        compareAtPrice: 2999,
        inventory: 10,
        skuPrefix: 'COMBO',
      }),
      metafields: [
        {
          namespace: 'custom',
          key: 'combo_items',
          type: 'list.single_line_text_field',
          value: ['classic-office-shirt', 'slim-fit-trousers', 'formal-leather-shoes'],
        },
      ],
    },
    {
      title: 'Classic Office Shirt',
      handle: 'classic-office-shirt',
      vendor: 'Aradhya',
      productType: 'Shirt',
      apparelType: 'TOP',
      category: 'Tops',
      tags: ['shirt', 'top', 'office'],
      descriptionHtml:
        '<p>A crisp, breathable shirt tailored for the daily office commute.</p>',
      collectionIds: [tops.id],
      media: [
        { url: '/images/mk1.jpg', alt: 'Office shirt front' },
        { url: '/images/mk2.jpg', alt: 'Office shirt back' },
      ],
      options: topOptions,
      variants: buildVariants(topOptions, {
        price: 1299,
        compareAtPrice: 1599,
        inventory: 12,
        skuPrefix: 'TOP',
      }),
    },
    {
      title: 'Weekend Knit Polo',
      handle: 'weekend-knit-polo',
      vendor: 'Aradhya',
      productType: 'Knit',
      apparelType: 'TOP',
      category: 'Tops',
      tags: ['polo', 'knit', 'weekend', 'new'],
      descriptionHtml:
        '<p>Soft knit polo with a relaxed drape and breathable texture for off-duty styling.</p>',
      collectionIds: [tops.id],
      media: [
        { url: '/images/mk3.jpg', alt: 'Knit polo front' },
        { url: '/images/mk4.jpg', alt: 'Knit polo detail' },
      ],
      options: topOptions,
      variants: buildVariants(topOptions, {
        price: 1399,
        compareAtPrice: 1699,
        inventory: 10,
        skuPrefix: 'KNIT',
      }),
    },
    {
      title: 'Slim Fit Trousers',
      handle: 'slim-fit-trousers',
      vendor: 'Aradhya',
      productType: 'Pant',
      apparelType: 'BOTTOM',
      category: 'Bottoms',
      tags: ['pant', 'bottom', 'trousers'],
      descriptionHtml:
        '<p>Stretchable slim-fit trousers that move with you.</p>',
      collectionIds: [bottoms.id],
      media: [
        { url: '/images/p1.jpg', alt: 'Trousers front' },
        { url: '/images/p2.png', alt: 'Trousers detail' },
      ],
      options: bottomOptions,
      variants: buildVariants(bottomOptions, {
        price: 1499,
        compareAtPrice: 1799,
        inventory: 15,
        skuPrefix: 'BOTTOM',
      }),
    },
    {
      title: 'Formal Leather Shoes',
      handle: 'formal-leather-shoes',
      vendor: 'Aradhya',
      productType: 'Shoes',
      apparelType: 'SHOES',
      category: 'Footwear',
      tags: ['shoe', 'footwear'],
      descriptionHtml:
        '<p>Polished leather shoes finished with a comfortable sole.</p>',
      collectionIds: [shoes.id],
      media: [
        { url: '/images/m5.jpg', alt: 'Formal shoes' },
      ],
      options: shoeOptions,
      variants: buildVariants(shoeOptions, {
        price: 1999,
        compareAtPrice: 2299,
        inventory: 8,
        skuPrefix: 'SHOE',
      }),
    },
  ];

  for (const product of products) {
    await createProductWithRelations(prisma, product);
  }

  console.log('Default products seeded (skipped existing handles).');
}

main()
  .catch((err) => {
    console.error('Failed to seed default products:', err.message || err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnect().catch(() => {});
  });
