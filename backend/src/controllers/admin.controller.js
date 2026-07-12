const bcrypt = require('bcrypt');
const { z } = require('zod');
const { OrderStatus } = require('@prisma/client');

const { getPrisma } = require('../db/prismaClient');
const { env } = require('../config/env');
const { signToken } = require('../utils/jwt');
const { sendSuccess, sendError } = require('../utils/response');

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const siteSettingsSchema = z.object({
  isOnline: z.boolean(),
  title: z.string().trim().max(80).optional(),
  message: z.string().trim().max(240).optional(),
});

const ownerCredentialsSchema = z
  .object({
    email: z.string().email().optional(),
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z.string().min(6, 'New password must be at least 6 characters').optional(),
  })
  .refine((payload) => payload.email || payload.newPassword, {
    message: 'No changes provided',
  });

const ownerProductVisibilitySchema = z.object({
  status: z.enum(['ACTIVE', 'DRAFT', 'ARCHIVED']),
});

const SITE_SETTINGS_TYPE = 'app_setting';
const SITE_SETTINGS_HANDLE = 'site_status';
const DEFAULT_SITE_SETTINGS = {
  isOnline: true,
  title: 'Website is offline',
  message: 'We are updating the store. Please check back soon.',
};

const normalizeSiteSettings = (value) => ({
  ...DEFAULT_SITE_SETTINGS,
  ...(value && typeof value === 'object' ? value : {}),
  isOnline: value?.isOnline !== false,
});

const readSiteSettings = async (prisma) => {
  const row = await prisma.metaobject.findFirst({
    where: {
      type: SITE_SETTINGS_TYPE,
      handle: SITE_SETTINGS_HANDLE,
    },
  });
  return normalizeSiteSettings(row?.fields);
};

exports.login = async (req, res, next) => {
  try {
    const { email, password } = loginSchema.parse(req.body);
    const prisma = await getPrisma();

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || user.role !== 'ADMIN') {
      return sendError(res, 401, 'Invalid email or password');
    }

    const isValid = user.passwordHash
      ? await bcrypt.compare(password, user.passwordHash)
      : false;
    if (!isValid) {
      return sendError(res, 401, 'Invalid email or password');
    }

    return sendSuccess(res, {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      token: signToken({ id: user.id, role: user.role }),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return sendError(res, 400, error.errors[0]?.message || 'Invalid payload');
    }
    return next(error);
  }
};

exports.getStats = async (req, res, next) => {
  try {
    const prisma = await getPrisma();

    const [
      totalProducts,
      activeProducts,
      draftProducts,
      totalOrders,
      pendingOrders,
      paidOrders,
      fulfilledOrders,
      totalUsers,
      adminUsers,
      customerUsers,
      totalCollections,
      recentOrders,
      totalRevenue,
    ] = await Promise.all([
      prisma.product.count(),
      prisma.product.count({ where: { status: 'ACTIVE' } }),
      prisma.product.count({ where: { status: 'DRAFT' } }),
      prisma.order.count(),
      prisma.order.count({ where: { status: OrderStatus.PENDING } }),
      prisma.order.count({ where: { status: OrderStatus.PAID } }),
      prisma.order.count({ where: { status: OrderStatus.FULFILLED } }),
      prisma.user.count(),
      prisma.user.count({ where: { role: 'ADMIN' } }),
      prisma.user.count({ where: { role: 'CUSTOMER' } }),
      prisma.collection.count(),
      prisma.order.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: { id: true, name: true, email: true },
          },
        },
      }),
      Promise.resolve(null), // Revenue calculation done separately
    ]);

    // Calculate revenue from paid and fulfilled orders
    const allPaidOrders = await prisma.order.findMany({
      where: {
        status: { in: [OrderStatus.PAID, OrderStatus.FULFILLED] },
      },
      select: {
        totals: true,
      },
    });

    const revenue = allPaidOrders.reduce((sum, order) => {
      const total = Number(order.totals?.total || 0);
      return sum + total;
    }, 0);

    let cancelledOrders = 0;
    try {
      cancelledOrders = await prisma.order.count({
        where: { status: OrderStatus.CANCELLED },
      });
    } catch (error) {
      const message = String(error?.message || '');
      const isEnumMismatch =
        message.includes('invalid input value for enum') &&
        message.includes('CANCELLED');
      if (!isEnumMismatch) {
        throw error;
      }
    }

    return sendSuccess(res, {
      products: {
        total: totalProducts,
        active: activeProducts,
        draft: draftProducts,
      },
      orders: {
        total: totalOrders,
        pending: pendingOrders,
        paid: paidOrders,
        fulfilled: fulfilledOrders,
        cancelled: cancelledOrders,
        recent: recentOrders.map((order) => ({
          id: order.id,
          number: order.number,
          status: order.status,
          total: order.totals?.total || 0,
          currency: order.totals?.currency || 'INR',
          customer: order.user
            ? {
                name: order.user.name,
                email: order.user.email,
              }
            : null,
          createdAt: order.createdAt,
        })),
      },
      users: {
        total: totalUsers,
        admins: adminUsers,
        customers: customerUsers,
      },
      collections: {
        total: totalCollections,
      },
      revenue: {
        total: revenue,
        currency: 'INR',
      },
    });
  } catch (error) {
    return next(error);
  }
};

exports.getSiteSettings = async (_req, res, next) => {
  try {
    res.setHeader('Cache-Control', 'public, s-maxage=900, stale-while-revalidate=3600');
    const prisma = await getPrisma();
    const settings = await readSiteSettings(prisma);
    return sendSuccess(res, settings);
  } catch (error) {
    return next(error);
  }
};

const isOwnerRequest = (req) =>
  String(req.user?.email || '').trim().toLowerCase() === env.ownerAdminEmail;

exports.getOwnerSiteSettings = async (req, res, next) => {
  try {
    if (!isOwnerRequest(req)) {
      return sendError(res, 403, 'Only the owner admin can manage website control.');
    }

    res.setHeader('Cache-Control', 'no-store');
    const prisma = await getPrisma();
    const settings = await readSiteSettings(prisma);
    return sendSuccess(res, {
      settings,
      owner: {
        email: req.user.email,
        access: 'OWNER',
      },
      backend: {
        ok: true,
        env: env.nodeEnv,
        timestamp: new Date().toISOString(),
        databaseConfigured: !!env.databaseUrl,
      },
    });
  } catch (error) {
    return next(error);
  }
};

exports.listOwnerProducts = async (req, res, next) => {
  try {
    if (!isOwnerRequest(req)) {
      return sendError(res, 403, 'Only the owner admin can manage website control.');
    }

    const prisma = await getPrisma();
    const products = await prisma.product.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        title: true,
        handle: true,
        status: true,
        updatedAt: true,
        media: {
          take: 1,
          orderBy: { position: 'asc' },
          select: { url: true, alt: true },
        },
      },
    });

    return sendSuccess(res, products);
  } catch (error) {
    return next(error);
  }
};

exports.updateOwnerProductVisibility = async (req, res, next) => {
  try {
    if (!isOwnerRequest(req)) {
      return sendError(res, 403, 'Only the owner admin can manage website control.');
    }

    const { status } = ownerProductVisibilitySchema.parse(req.body);
    const prisma = await getPrisma();
    const product = await prisma.product.update({
      where: { id: req.params.id },
      data: {
        status,
        publishedAt: status === 'ACTIVE' ? new Date() : null,
      },
      select: {
        id: true,
        title: true,
        handle: true,
        status: true,
        updatedAt: true,
      },
    });

    return sendSuccess(res, product);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return sendError(res, 400, error.errors[0]?.message || 'Invalid payload');
    }
    if (error.code === 'P2025') {
      return sendError(res, 404, 'Product not found');
    }
    return next(error);
  }
};

exports.updateOwnerCredentials = async (req, res, next) => {
  try {
    if (!isOwnerRequest(req)) {
      return sendError(res, 403, 'Only the owner admin can manage website control.');
    }

    const payload = ownerCredentialsSchema.parse(req.body);
    const prisma = await getPrisma();
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, email: true, name: true, role: true, passwordHash: true },
    });

    if (!user?.passwordHash) {
      return sendError(res, 404, 'Owner account not found.');
    }

    const isValid = await bcrypt.compare(payload.currentPassword, user.passwordHash);
    if (!isValid) {
      return sendError(res, 400, 'Current password is incorrect.');
    }

    const data = {};
    if (payload.email) data.email = payload.email.trim().toLowerCase();
    if (payload.newPassword) {
      const salt = await bcrypt.genSalt(10);
      data.passwordHash = await bcrypt.hash(payload.newPassword, salt);
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data,
      select: { id: true, email: true, name: true, role: true },
    });

    return sendSuccess(res, {
      user: updated,
      token: signToken({ id: updated.id, role: updated.role }),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return sendError(res, 400, error.errors[0]?.message || 'Invalid payload');
    }
    if (error.code === 'P2002') {
      return sendError(res, 409, 'Email already exists');
    }
    return next(error);
  }
};

exports.updateSiteSettings = async (req, res, next) => {
  try {
    if (!isOwnerRequest(req)) {
      return sendError(res, 403, 'Only the owner admin can manage website control.');
    }

    const payload = siteSettingsSchema.parse(req.body);
    const prisma = await getPrisma();
    const value = normalizeSiteSettings(payload);

    const existing = await prisma.metaobject.findFirst({
      where: {
        type: SITE_SETTINGS_TYPE,
        handle: SITE_SETTINGS_HANDLE,
      },
      select: { id: true },
    });

    const row = existing
      ? await prisma.metaobject.update({
        where: { id: existing.id },
        data: { fields: value, publishedAt: new Date() },
      })
      : await prisma.metaobject.create({
        data: {
          type: SITE_SETTINGS_TYPE,
          handle: SITE_SETTINGS_HANDLE,
          fields: value,
          publishedAt: new Date(),
        },
      });

    res.setHeader('Cache-Control', 'no-store');
    return sendSuccess(res, normalizeSiteSettings(row.fields));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return sendError(res, 400, error.errors[0]?.message || 'Invalid payload');
    }
    return next(error);
  }
};
