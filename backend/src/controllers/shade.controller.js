const { z } = require('zod');

const { getPrisma } = require('../db/prismaClient');

const shadeSchema = z.object({
  name: z.string().min(1),
  hexColor: z
    .string()
    .regex(/^#?[0-9a-fA-F]{6}$/, 'Hex must be a 6 character hex code')
    .transform((value) => (value.startsWith('#') ? value : `#${value}`)),
  sku: z.string().optional(),
  arAssetUrl: z.string().trim().optional().nullable(),
  arPreviewUrl: z.string().trim().optional().nullable(),
  arCode: z.string().trim().optional().nullable(),
  price: z.number().min(0).optional(),
  quantity: z.number().int().min(0).optional(),
  productId: z.string().optional(),
});

const normalizeHex = (hex) => hex.toUpperCase();
const toDecimalString = (value) =>
  value !== undefined && value !== null ? value.toString() : null;

exports.listShades = async (_req, res, next) => {
  try {
    const prisma = await getPrisma();
    const shades = await prisma.shade.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        product: {
          select: { id: true, name: true, slug: true },
        },
        inventory: true,
      },
    });
    return res.status(200).json(shades);
  } catch (error) {
    return next(error);
  }
};

exports.getShade = async (req, res, next) => {
  try {
    const prisma = await getPrisma();
    const shade = await prisma.shade.findUnique({
      where: { id: req.params.id },
      include: {
        product: {
          select: { id: true, name: true, slug: true },
        },
        inventory: true,
      },
    });
    if (!shade) {
      return res.status(404).json({ message: 'Shade not found' });
    }
    return res.status(200).json(shade);
  } catch (error) {
    return next(error);
  }
};

exports.createShade = async (req, res, next) => {
  try {
    const payload = shadeSchema.parse(req.body);
    const prisma = await getPrisma();

    const shade = await prisma.shade.create({
      data: {
        name: payload.name,
        hexColor: normalizeHex(payload.hexColor),
        sku: payload.sku ?? null,
        arAssetUrl: payload.arAssetUrl ?? null,
        arPreviewUrl: payload.arPreviewUrl ?? null,
        arCode: payload.arCode ?? null,
        price: toDecimalString(payload.price),
        product: payload.productId
          ? { connect: { id: payload.productId } }
          : undefined,
        inventory: {
          create: {
            quantity: payload.quantity ?? 0,
          },
        },
      },
      include: {
        product: {
          select: { id: true, name: true, slug: true },
        },
        inventory: true,
      },
    });

    return res.status(201).json(shade);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res
        .status(400)
        .json({ message: error.errors[0]?.message || 'Invalid payload' });
    }
    if (error.code === 'P2002') {
      return res.status(409).json({ message: 'Shade SKU already exists' });
    }
    if (error.code === 'P2025') {
      return res
        .status(400)
        .json({ message: 'Associated product not found' });
    }
    return next(error);
  }
};

exports.updateShade = async (req, res, next) => {
  try {
    const payload = shadeSchema.partial().parse(req.body);
    const prisma = await getPrisma();

    const shade = await prisma.shade.update({
      where: { id: req.params.id },
      data: {
        name: payload.name,
        hexColor:
          payload.hexColor !== undefined
            ? normalizeHex(payload.hexColor)
            : undefined,
        sku: payload.sku ?? undefined,
        arAssetUrl:
          payload.arAssetUrl !== undefined
            ? payload.arAssetUrl || null
            : undefined,
        arPreviewUrl:
          payload.arPreviewUrl !== undefined
            ? payload.arPreviewUrl || null
            : undefined,
        arCode:
          payload.arCode !== undefined
            ? payload.arCode || null
            : undefined,
        price:
          payload.price !== undefined ? toDecimalString(payload.price) : undefined,
        product: payload.productId
          ? { connect: { id: payload.productId } }
          : payload.productId === null
          ? { disconnect: true }
          : undefined,
      },
      include: {
        product: {
          select: { id: true, name: true, slug: true },
        },
        inventory: true,
      },
    });

    if (payload.quantity !== undefined) {
      await prisma.inventory.upsert({
        where: { shadeId: shade.id },
        create: {
          shadeId: shade.id,
          quantity: payload.quantity ?? 0,
        },
        update: {
          quantity: payload.quantity ?? 0,
        },
      });
    }

    const refreshed = await prisma.shade.findUnique({
      where: { id: shade.id },
      include: {
        product: {
          select: { id: true, name: true, slug: true },
        },
        inventory: true,
      },
    });

    return res.status(200).json(refreshed);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res
        .status(400)
        .json({ message: error.errors[0]?.message || 'Invalid payload' });
    }
    if (error.code === 'P2025') {
      return res.status(404).json({ message: 'Shade not found' });
    }
    if (error.code === 'P2002') {
      return res.status(409).json({ message: 'Shade SKU already exists' });
    }
    return next(error);
  }
};

exports.deleteShade = async (req, res, next) => {
  try {
    const prisma = await getPrisma();
    await prisma.inventory.deleteMany({ where: { shadeId: req.params.id } });
    await prisma.shade.delete({ where: { id: req.params.id } });
    return res.status(204).send();
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ message: 'Shade not found' });
    }
    return next(error);
  }
};
