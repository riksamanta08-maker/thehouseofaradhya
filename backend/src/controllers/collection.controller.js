const { z } = require('zod');

const { getPrisma } = require('../db/prismaClient');
const { sendSuccess, sendError } = require('../utils/response');

const COLLECTION_TYPES = ['MANUAL', 'AUTOMATED'];

const slugify = (value) => {
  if (!value) return undefined;
  return value
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
};

const baseCollectionSchema = z.object({
  title: z.string().min(1),
  handle: z.string().min(1),
  descriptionHtml: z.string().optional(),
  imageUrl: z.string().url().optional(),
  type: z.enum(COLLECTION_TYPES).optional(),
  rules: z.any().optional(),
  templateSuffix: z.string().optional(),
  publishedAt: z.coerce.date().optional(),
  parentId: z.string().optional().nullable(),
  parentHandle: z.string().optional(),
  productIds: z.array(z.string().min(1)).optional(),
  productHandles: z.array(z.string().min(1)).optional(),
});

const normalizeCollectionInput = (raw = {}, { partial = false } = {}) => {
  const normalized = { ...raw };

  if (raw.title !== undefined) normalized.title = String(raw.title).trim();
  if (raw.handle !== undefined) {
    normalized.handle = String(raw.handle).trim() || slugify(raw.title);
  } else if (!partial && raw.title) {
    normalized.handle = slugify(raw.title);
  }

  if (raw.descriptionHtml !== undefined) {
    normalized.descriptionHtml = String(raw.descriptionHtml);
  } else if (raw.description !== undefined) {
    normalized.descriptionHtml = String(raw.description);
  }

  if (raw.imageUrl !== undefined) normalized.imageUrl = String(raw.imageUrl).trim();

  if (raw.type !== undefined) {
    const type = String(raw.type).toUpperCase();
    if (COLLECTION_TYPES.includes(type)) normalized.type = type;
  }

  if (raw.rules !== undefined) normalized.rules = raw.rules;
  if (raw.templateSuffix !== undefined) normalized.templateSuffix = String(raw.templateSuffix).trim();
  if (raw.publishedAt !== undefined) normalized.publishedAt = raw.publishedAt;

  if (raw.parentId !== undefined) normalized.parentId = raw.parentId || null;
  if (raw.parentHandle !== undefined) {
    normalized.parentHandle = String(raw.parentHandle).trim();
  }

  if (raw.productIds !== undefined) {
    if (Array.isArray(raw.productIds)) {
      normalized.productIds = raw.productIds.map((id) => String(id).trim()).filter(Boolean);
    } else if (typeof raw.productIds === 'string') {
      normalized.productIds = raw.productIds
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean);
    }
  }

  if (raw.productHandles !== undefined) {
    if (Array.isArray(raw.productHandles)) {
      normalized.productHandles = raw.productHandles
        .map((handle) => String(handle).trim())
        .filter(Boolean);
    } else if (typeof raw.productHandles === 'string') {
      normalized.productHandles = raw.productHandles
        .split(',')
        .map((handle) => handle.trim())
        .filter(Boolean);
    }
  }

  return normalized;
};

const parseCollectionInput = (raw, { partial = false } = {}) => {
  const normalized = normalizeCollectionInput(raw, { partial });
  const schema = partial ? baseCollectionSchema.partial() : baseCollectionSchema;
  return schema.parse(normalized);
};

const collectionInclude = {
  parent: true,
  children: true,
  _count: { select: { products: true } },
};

const collectionListSelect = {
  id: true,
  handle: true,
  title: true,
  descriptionHtml: true,
  imageUrl: true,
  parentId: true,
  publishedAt: true,
  parent: { select: { id: true, title: true, handle: true } },
  _count: { select: { products: true } },
};

const collectionDetailSelect = {
  id: true,
  handle: true,
  title: true,
  descriptionHtml: true,
  imageUrl: true,
  type: true,
  rules: true,
  templateSuffix: true,
  publishedAt: true,
  parentId: true,
  createdAt: true,
  updatedAt: true,
  parent: { select: { id: true, title: true, handle: true } },
  children: { select: { id: true, title: true, handle: true } },
  products: {
    select: {
      position: true,
      product: {
        select: {
          id: true,
          title: true,
          handle: true,
          status: true,
          vendor: true,
        },
      },
    },
    orderBy: { position: 'asc' },
  },
};

const collectionCompactSelect = {
  ...collectionListSelect,
  products: {
    select: {
      position: true,
      product: {
        select: {
          id: true,
          title: true,
          handle: true,
          status: true,
          vendor: true,
          category: true,
          tags: true,
          
          media: {
  select: {
    url: true,
    alt: true,
    type: true,
    position: true,
  },
},
          variants: {
  select: {
    id: true,
    externalNumericId: true,
    title: true,
    price: true,
    compareAtPrice: true,
    sku: true,
    optionValues: true,
  },
},
        },
      },
    },
    orderBy: { position: 'asc' },
  },
};

const resolveParentId = async (prisma, payload) => {
  if (payload.parentId !== undefined) return payload.parentId;
  if (!payload.parentHandle) return undefined;
  const parent = await prisma.collection.findUnique({
    where: { handle: payload.parentHandle },
    select: { id: true },
  });
  return parent?.id ?? null;
};

const resolveProductIds = async (prisma, payload) => {
  const ids = Array.isArray(payload.productIds) ? payload.productIds : [];
  const handles = Array.isArray(payload.productHandles) ? payload.productHandles : [];

  if (!handles.length) {
    return Array.from(new Set(ids));
  }

  const found = await prisma.product.findMany({
    where: { handle: { in: handles } },
    select: { id: true },
  });

  return Array.from(new Set([...ids, ...found.map((item) => item.id)]));
};

/* ── In-memory cache for public collection lists ── */
const collectionListCache = new Map();
const COLLECTION_CACHE_TTL = 30 * 60_000;

exports.listCollections = async (req, res, next) => {
  try {
    const _start = Date.now();
    const prisma = await getPrisma();
    const page = Math.max(Number.parseInt(req.query?.page, 10) || 1, 1);
    const limit = Number.parseInt(req.query?.limit, 10);
    const take = Number.isFinite(limit) && limit > 0 ? Math.min(limit, 200) : 24;
    const skip = (page - 1) * take;

    const includeMode = String(req.query?.include ?? '').toLowerCase();
    const includeOptions =
      includeMode === 'full' ? { include: collectionInclude } : { select: collectionListSelect };

    const cacheKey = `collections:${JSON.stringify({ take, skip, includeMode })}`;
    const cached = collectionListCache.get(cacheKey);
    let collections;

    if (cached && cached.expiresAt > Date.now()) {
      collections = cached.value;
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[API] listCollections: ${collections.length} items from CACHE in ${Date.now() - _start}ms`);
      }
    } else {
      if (cached) collectionListCache.delete(cacheKey);
      collections = await prisma.collection.findMany({
        orderBy: { title: 'asc' },
        ...includeOptions,
        take,
        skip,
      });
      collectionListCache.set(cacheKey, { value: collections, expiresAt: Date.now() + COLLECTION_CACHE_TTL });
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[API] listCollections: ${collections.length} items from DB in ${Date.now() - _start}ms`);
      }
    }

    res.set('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    return sendSuccess(res, collections, { page, limit: take });
  } catch (error) {
    return next(error);
  }
};

exports.getCollection = async (req, res, next) => {
  try {
    const prisma = await getPrisma();
    const includeMode = String(req.query?.include ?? '').toLowerCase();
    const includeOptions =
      includeMode === 'compact'
        ? { select: collectionCompactSelect }
        : includeMode === 'detail'
          ? { select: collectionDetailSelect }
          : {
            include: {
              ...collectionInclude,
              products: {
                include: { product: { select: { id: true, title: true, handle: true } } },
              },
            },
          };
    const collection = await prisma.collection.findUnique({
      where: { id: req.params.id },
      ...includeOptions,
    });
    if (!collection) {
      return sendError(res, 404, 'Collection not found');
    }
    res.set('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    return sendSuccess(res, collection);
  } catch (error) {
    return next(error);
  }
};

exports.getCollectionBySlug = async (req, res, next) => {
  try {
    const prisma = await getPrisma();
    const includeMode = String(req.query?.include ?? '').toLowerCase();
    const includeOptions =
      includeMode === 'compact'
        ? { select: collectionCompactSelect }
        : includeMode === 'detail'
          ? { select: collectionDetailSelect }
          : { include: collectionInclude };
    const collection = await prisma.collection.findUnique({
      where: { handle: req.params.slug },
      ...includeOptions,
    });
    if (!collection) {
      return sendError(res, 404, 'Collection not found');
    }
    if (process.env.NODE_ENV !== 'production') {
      console.log('[API] getCollectionBySlug', {
        slug: req.params.slug,
        include: includeMode || 'default',
        collection: {
          id: collection.id,
          handle: collection.handle,
          title: collection.title,
          productCount: collection?._count?.products ?? null,
        },
      });
    }
    res.set('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');

    const safeCollection = JSON.parse(
  JSON.stringify(
    collection,
    (_, value) => (typeof value === 'bigint' ? Number(value) : value)
  )
);

    return sendSuccess(res, safeCollection);
  } catch (error) {
    return next(error);
  }
};

exports.createCollection = async (req, res, next) => {
  try {
    const payload = parseCollectionInput(req.body);
    const prisma = await getPrisma();
    const parentId = await resolveParentId(prisma, payload);
    const productIds = await resolveProductIds(prisma, payload);

    const collection = await prisma.$transaction(async (tx) => {
      const created = await tx.collection.create({
        data: {
          title: payload.title,
          handle: payload.handle,
          descriptionHtml: payload.descriptionHtml,
          imageUrl: payload.imageUrl,
          type: payload.type ?? 'MANUAL',
          rules: payload.rules,
          templateSuffix: payload.templateSuffix,
          publishedAt: payload.publishedAt ?? null,
          parentId,
        },
      });

      if (productIds.length > 0) {
        await tx.productCollection.createMany({
          data: productIds.map((productId, index) => ({
            productId,
            collectionId: created.id,
            position: index,
          })),
          skipDuplicates: true,
        });
      }

      return tx.collection.findUnique({
        where: { id: created.id },
        include: collectionInclude,
      });
    });

    collectionListCache.clear();
    res.status(201);
    return sendSuccess(res, collection);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return sendError(res, 400, error.errors[0]?.message || 'Invalid payload');
    }
    if (error.code === 'P2002') {
      return sendError(res, 409, 'Collection handle already exists');
    }
    return next(error);
  }
};

exports.updateCollection = async (req, res, next) => {
  try {
    const payload = parseCollectionInput(req.body, { partial: true });
    const prisma = await getPrisma();
    const parentId = await resolveParentId(prisma, payload);
    const shouldSyncProducts =
      Object.prototype.hasOwnProperty.call(payload, 'productIds') ||
      Object.prototype.hasOwnProperty.call(payload, 'productHandles');
    const productIds = shouldSyncProducts
      ? await resolveProductIds(prisma, payload)
      : [];

    const collection = await prisma.$transaction(async (tx) => {
      const updated = await tx.collection.update({
        where: { id: req.params.id },
        data: {
          title: payload.title,
          handle: payload.handle,
          descriptionHtml: payload.descriptionHtml,
          imageUrl: payload.imageUrl,
          type: payload.type,
          rules: payload.rules,
          templateSuffix: payload.templateSuffix,
          publishedAt: payload.publishedAt ?? undefined,
          parentId: parentId ?? payload.parentId,
        },
      });

      if (shouldSyncProducts) {
        await tx.productCollection.deleteMany({
          where: { collectionId: updated.id },
        });

        if (productIds.length > 0) {
          await tx.productCollection.createMany({
            data: productIds.map((productId, index) => ({
              productId,
              collectionId: updated.id,
              position: index,
            })),
            skipDuplicates: true,
          });
        }
      }

      return tx.collection.findUnique({
        where: { id: updated.id },
        include: collectionInclude,
      });
    });

    collectionListCache.clear();
    return sendSuccess(res, collection);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return sendError(res, 400, error.errors[0]?.message || 'Invalid payload');
    }
    if (error.code === 'P2025') {
      return sendError(res, 404, 'Collection not found');
    }
    if (error.code === 'P2002') {
      return sendError(res, 409, 'Collection handle already exists');
    }
    return next(error);
  }
};

exports.deleteCollection = async (req, res, next) => {
  try {
    const prisma = await getPrisma();
    await prisma.collection.delete({ where: { id: req.params.id } });
    collectionListCache.clear();
    return res.status(204).send();
  } catch (error) {
    if (error.code === 'P2025') {
      return sendError(res, 404, 'Collection not found');
    }
    return next(error);
  }
};


exports.reorderProducts = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { productIds } = req.body;
    
    if (!Array.isArray(productIds)) {
      return res.status(400).json({ message: 'productIds must be an array of strings' });
    }

    const prisma = await getPrisma();
    
    // First verify the collection exists
    const collection = await prisma.collection.findUnique({
      where: { id }
    });
    
    if (!collection) {
      return res.status(404).json({ message: 'Collection not found' });
    }

    // Wrap the updates in a transaction
    await prisma.$transaction(
      productIds.map((productId, index) => {
        return prisma.productCollection.update({
          where: {
            productId_collectionId: {
              productId,
              collectionId: id
            }
          },
          data: {
            position: index + 1
          }
        });
      })
    );

    return res.status(200).json({ message: 'Product positions updated successfully' });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ message: 'One or more products are not in this collection' });
    }
    return next(error);
  }
};
