const { z } = require('zod');

const { getPrisma } = require('../db/prismaClient');

const quantitySchema = z.object({
  quantity: z.coerce.number().int().min(0),
  locationId: z.string().trim().optional(),
  location: z.string().trim().optional(),
});

const getDefaultLocation = async (prisma, name = 'Default') =>
  prisma.location.upsert({
    where: { name },
    create: { name },
    update: {},
  });

const inventoryInclude = {
  variant: {
    select: {
      id: true,
      externalNumericId: true,
      title: true,
      sku: true,
      trackInventory: true,
      inventoryPolicy: true,
      product: {
        select: {
          id: true,
          externalNumericId: true,
          title: true,
          handle: true,
        },
      },
    },
  },
  location: true,
};

const serializeLevel = (level) => ({
  ...level,
  variant: level.variant
    ? {
        ...level.variant,
        externalNumericId:
          level.variant.externalNumericId === null || level.variant.externalNumericId === undefined
            ? null
            : Number(level.variant.externalNumericId),
        product: level.variant.product
          ? {
              ...level.variant.product,
              externalNumericId:
                level.variant.product.externalNumericId === null ||
                level.variant.product.externalNumericId === undefined
                  ? null
                  : Number(level.variant.product.externalNumericId),
            }
          : null,
      }
    : null,
});

exports.listInventory = async (_req, res, next) => {
  try {
    const prisma = await getPrisma();
    const records = await prisma.inventoryLevel.findMany({
      orderBy: { updatedAt: 'desc' },
      include: inventoryInclude,
    });
    return res.status(200).json(records.map(serializeLevel));
  } catch (error) {
    return next(error);
  }
};

exports.listLowStock = async (req, res, next) => {
  try {
    const lt = Number(req.query.lt ?? 10);
    const prisma = await getPrisma();
    const records = await prisma.inventoryLevel.findMany({
      where: { available: { lt } },
      orderBy: { available: 'asc' },
      include: inventoryInclude,
    });
    return res.status(200).json(records.map(serializeLevel));
  } catch (error) {
    return next(error);
  }
};

exports.updateInventory = async (req, res, next) => {
  try {
    const payload = quantitySchema.parse(req.body);
    const prisma = await getPrisma();
    const variantId = String(req.params.variantId || '').trim();

    const variant = await prisma.productVariant.findUnique({
      where: { id: variantId },
      select: { id: true },
    });

    if (!variant) {
      return res.status(404).json({ message: 'Variant not found' });
    }

    const location = payload.locationId
      ? await prisma.location.findUnique({ where: { id: payload.locationId } })
      : await getDefaultLocation(prisma, payload.location || 'Default');

    if (!location) {
      return res.status(404).json({ message: 'Location not found' });
    }

    const record = await prisma.inventoryLevel.upsert({
      where: {
        variantId_locationId: {
          variantId,
          locationId: location.id,
        },
      },
      create: {
        variantId,
        locationId: location.id,
        available: payload.quantity,
        onHand: payload.quantity,
        committed: 0,
        unavailable: 0,
      },
      update: {
        available: payload.quantity,
        onHand: payload.quantity,
      },
      include: inventoryInclude,
    });

    return res.status(200).json(serializeLevel(record));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res
        .status(400)
        .json({ message: error.errors[0]?.message || 'Invalid payload' });
    }
    if (error.code === 'P2003' || error.code === 'P2025') {
      return res.status(404).json({ message: 'Variant or location not found' });
    }
    return next(error);
  }
};
