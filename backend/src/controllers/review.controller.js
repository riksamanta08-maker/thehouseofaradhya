const { z } = require('zod');

const { getPrisma } = require('../db/prismaClient');

const REVIEW_STATUSES = ['PENDING', 'PUBLISHED', 'REJECTED'];

const mediaSchema = z.object({
  url: z.string().trim().min(1, 'Media URL is required'),
});

const baseReviewSchema = z.object({
  rating: z
    .number({
      required_error: 'Rating is required',
    })
    .int()
    .min(1)
    .max(5),
  title: z.string().trim().max(150).nullish(),
  comment: z.string().trim().max(1000).nullish(),
  media: z.array(mediaSchema).max(6).optional(),
});

const createReviewSchema = baseReviewSchema.extend({
  productId: z.string().min(1, 'Product id is required'),
  status: z.enum(REVIEW_STATUSES).optional(),
});

const updateReviewSchema = baseReviewSchema
  .partial()
  .extend({
    status: z.enum(REVIEW_STATUSES).optional(),
  })
  .refine((payload) => Object.keys(payload).length > 0, {
    message: 'Provide at least one field to update',
  });

const querySchema = z.object({
  status: z.enum(['PENDING', 'PUBLISHED', 'REJECTED', 'ALL']).optional().default('PUBLISHED'),
  productId: z.string().min(1).optional(),
  userId: z.string().min(1).optional(),
  search: z.string().trim().min(2).optional(),
});

const reviewInclude = {
  user: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
  product: {
    select: {
      id: true,
      title: true,
      handle: true,
    },
  },
  media: true,
};

const toZodMessage = (error, fallback) => error?.errors?.[0]?.message || fallback;

const canManageReview = (reqUser, reviewUserId) =>
  reqUser?.role === 'ADMIN' || reqUser?.id === reviewUserId;

exports.listReviews = async (req, res, next) => {
  try {
    const prisma = await getPrisma();
    const parsed = querySchema.parse(req.query ?? {});
    const isAdmin = req.user?.role === 'ADMIN';

    const effectiveStatus = isAdmin
      ? parsed.status === 'ALL'
        ? undefined
        : parsed.status
      : 'PUBLISHED';

    const where = {
      status: effectiveStatus,
      productId: parsed.productId,
      userId: parsed.userId,
      OR: parsed.search
        ? [
            { title: { contains: parsed.search } },
            { comment: { contains: parsed.search } },
            { user: { name: { contains: parsed.search } } },
            { user: { email: { contains: parsed.search } } },
          ]
        : undefined,
    };

    Object.keys(where).forEach((key) => {
      if (where[key] === undefined) {
        delete where[key];
      }
    });

    const reviews = await prisma.review.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: reviewInclude,
    });

    const aggregate = await prisma.review.groupBy({
      by: ['status'],
      where: {
        ...where,
        status: undefined,
      },
      _count: true,
    });

    const publishedCount = aggregate.find((item) => item.status === 'PUBLISHED')?._count ?? 0;
    const pendingCount = aggregate.find((item) => item.status === 'PENDING')?._count ?? 0;
    const rejectedCount = aggregate.find((item) => item.status === 'REJECTED')?._count ?? 0;

    const publishedReviews = reviews.filter((item) => item.status === 'PUBLISHED');
    const averageRating = publishedReviews.length
      ? Number(
          (
            publishedReviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) /
            publishedReviews.length
          ).toFixed(2),
        )
      : 0;

    return res.status(200).json({
      items: reviews,
      meta: {
        count: reviews.length,
        averageRating,
        publishedCount,
        pendingCount: isAdmin ? pendingCount : 0,
        rejectedCount: isAdmin ? rejectedCount : 0,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        message: toZodMessage(error, 'Invalid review query'),
      });
    }
    return next(error);
  }
};

exports.getReview = async (req, res, next) => {
  try {
    const prisma = await getPrisma();
    const review = await prisma.review.findUnique({
      where: { id: req.params.id },
      include: reviewInclude,
    });
    if (!review) {
      return res.status(404).json({ message: 'Review not found' });
    }

    const isPublished = review.status === 'PUBLISHED';
    if (!isPublished && !canManageReview(req.user, review.userId)) {
      return res.status(404).json({ message: 'Review not found' });
    }

    return res.status(200).json(review);
  } catch (error) {
    return next(error);
  }
};

exports.createReview = async (req, res, next) => {
  try {
    const payload = createReviewSchema.parse(req.body);
    const prisma = await getPrisma();
    const isAdmin = req.user?.role === 'ADMIN';

    const review = await prisma.review.create({
      data: {
        rating: payload.rating,
        title: payload.title ?? null,
        comment: payload.comment ?? null,
        status: isAdmin ? payload.status ?? 'PUBLISHED' : 'PENDING',
        product: { connect: { id: payload.productId } },
        user: { connect: { id: req.user.id } },
        media: payload.media?.length
          ? {
              create: payload.media.map((item) => ({ url: item.url })),
            }
          : undefined,
      },
      include: reviewInclude,
    });
    return res.status(201).json(review);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        message: toZodMessage(error, 'Invalid review payload'),
      });
    }
    if (error.code === 'P2003') {
      return res.status(400).json({ message: 'Invalid productId' });
    }
    return next(error);
  }
};

exports.updateReview = async (req, res, next) => {
  try {
    const payload = updateReviewSchema.parse(req.body);
    const prisma = await getPrisma();

    const existing = await prisma.review.findUnique({
      where: { id: req.params.id },
      select: { id: true, userId: true, status: true },
    });
    if (!existing) {
      return res.status(404).json({ message: 'Review not found' });
    }

    const isAdmin = req.user?.role === 'ADMIN';
    if (!canManageReview(req.user, existing.userId)) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    if (!isAdmin && payload.status !== undefined) {
      return res.status(403).json({ message: 'Only admins can change review status' });
    }

    const review = await prisma.review.update({
      where: { id: req.params.id },
      data: {
        rating: payload.rating,
        title: payload.title,
        comment: payload.comment,
        status: isAdmin ? payload.status : undefined,
        media: payload.media
          ? {
              deleteMany: {},
              create: payload.media.map((item) => ({ url: item.url })),
            }
          : undefined,
      },
      include: reviewInclude,
    });
    return res.status(200).json(review);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        message: toZodMessage(error, 'Invalid review update payload'),
      });
    }
    if (error.code === 'P2025') {
      return res.status(404).json({ message: 'Review not found' });
    }
    return next(error);
  }
};

exports.deleteReview = async (req, res, next) => {
  try {
    const prisma = await getPrisma();
    const existing = await prisma.review.findUnique({
      where: { id: req.params.id },
      select: { id: true, userId: true },
    });

    if (!existing) {
      return res.status(404).json({ message: 'Review not found' });
    }
    if (!canManageReview(req.user, existing.userId)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    await prisma.review.delete({
      where: { id: req.params.id },
    });
    return res.status(204).send();
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ message: 'Review not found' });
    }
    return next(error);
  }
};
