const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { z } = require('zod');

const { getPrisma } = require('../db/prismaClient');
const {
  getFirebasePublicConfig,
  verifyFirebaseIdToken,
} = require('../utils/firebaseAdmin');
const { signToken } = require('../utils/jwt');
const { sendSuccess, sendError } = require('../utils/response');

const authSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  name: z.string().trim().optional(),
});

const googleAuthSchema = z.object({
  idToken: z.string().min(1, 'Google token is required'),
  name: z.string().trim().optional(),
});

const phoneAuthSchema = z.object({
  idToken: z.string().min(1, 'Phone verification token is required'),
  name: z.string().trim().optional(),
});

const roleSchema = z.object({
  role: z.enum(['ADMIN', 'CUSTOMER']),
});

const forgotSchema = z.object({
  email: z.string().email(),
});

const resetSchema = z.object({
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

const updateProfileSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').optional(),
    email: z.string().email().optional(),
  })
  .refine((payload) => payload.name || payload.email, {
    message: 'No changes provided',
  });

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z.string().min(6, 'New password must be at least 6 characters'),
  })
  .refine((payload) => payload.currentPassword !== payload.newPassword, {
    message: 'New password must be different from current password',
  });

const sanitizeUser = (user) => {
  if (!user) return null;
  const { passwordHash, ...rest } = user;
  return rest;
};

const buildAuthResponse = (user) => ({
  user: sanitizeUser(user),
  token: signToken({ id: user.id, role: user.role }),
});

const handleError = (error, res, next) => {
  if (error.code === 'P2002') {
    return sendError(res, 409, 'Email already exists');
  }
  return next(error);
};

exports.signup = async (req, res, next) => {
  try {
    const { email, password, name } = authSchema.parse(req.body);
    const prisma = await getPrisma();

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const user = await prisma.user.create({
      data: {
        email,
        name,
        passwordHash,
      },
    });

    res.status(201);
    return sendSuccess(res, buildAuthResponse(user));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return sendError(res, 400, error.errors[0]?.message || 'Invalid payload');
    }
    return handleError(error, res, next);
  }
};

exports.signin = async (req, res, next) => {
  try {
    const { email, password } = authSchema.omit({ name: true }).parse(req.body);
    const prisma = await getPrisma();

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return sendError(res, 401, 'Invalid email or password');
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      return sendError(res, 401, 'Invalid email or password');
    }

    return sendSuccess(res, buildAuthResponse(user));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return sendError(res, 400, error.errors[0]?.message || 'Invalid payload');
    }
    return next(error);
  }
};

exports.googleSignin = async (req, res, next) => {
  try {
    const { idToken, name } = googleAuthSchema.parse(req.body);
    const decoded = await verifyFirebaseIdToken(idToken);
    const email = String(decoded?.email || '')
      .trim()
      .toLowerCase();

    if (!email) {
      return sendError(res, 400, 'Google account email is unavailable');
    }

    if (decoded.email_verified === false) {
      return sendError(res, 401, 'Google account email is not verified');
    }

    const normalizedName = String(name || decoded.name || '').trim() || null;
    const prisma = await getPrisma();

    let user = await prisma.user.findFirst({
      where: { email: { equals: email } },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          email,
          name: normalizedName,
          passwordHash: null,
        },
      });
    } else if (!user.name && normalizedName) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { name: normalizedName },
      });
    }

    return sendSuccess(res, buildAuthResponse(user));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return sendError(res, 400, error.errors[0]?.message || 'Invalid payload');
    }
    if (error?.code === 'FIREBASE_NOT_CONFIGURED') {
      return sendError(res, 503, 'Google sign-in is not configured on this server');
    }
    if (error?.code === 'FIREBASE_CONFIG_INVALID') {
      return sendError(res, 503, 'Google sign-in server configuration is invalid');
    }
    if (error?.code === 'FIREBASE_TOKEN_INVALID') {
      return sendError(res, 401, 'Google token is invalid or expired');
    }
    if (typeof error?.code === 'string' && error.code.startsWith('auth/')) {
      return sendError(res, 401, 'Google token is invalid or expired');
    }
    return handleError(error, res, next);
  }
};

exports.firebasePhoneSignin = async (req, res, next) => {
  try {
    const { idToken, name } = phoneAuthSchema.parse(req.body);
    const decoded = await verifyFirebaseIdToken(idToken);
    
    const phoneNumber = String(decoded?.phone_number || decoded?.phoneNumber || '').trim();

    if (!phoneNumber) {
      return sendError(res, 400, 'Phone number is unavailable in token');
    }

    const prisma = await getPrisma();

    // Check if user exists by phoneNumber
    let user = await prisma.user.findFirst({
      where: { phoneNumber: { equals: phoneNumber } },
    });

    if (!user) {
      // Create safe placeholder email
      const safeEmail = phoneNumber.replace(/[^a-zA-Z0-9]/g, '') + '@phone.aradhya';
      
      // Double check if this email already exists (unlikely, but safe)
      const existingEmailUser = await prisma.user.findUnique({
        where: { email: safeEmail }
      });
      
      const finalEmail = existingEmailUser 
        ? `${safeEmail.split('@')[0]}_${crypto.randomBytes(4).toString('hex')}@phone.aradhya`
        : safeEmail;

      user = await prisma.user.create({
        data: {
          email: finalEmail,
          phoneNumber,
          name: name || 'Guest Customer',
          passwordHash: null,
        },
      });
    } else if (!user.name && name) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { name },
      });
    }

    return sendSuccess(res, buildAuthResponse(user));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return sendError(res, 400, error.errors[0]?.message || 'Invalid payload');
    }
    if (error?.code === 'FIREBASE_NOT_CONFIGURED') {
      return sendError(res, 503, 'Phone sign-in is not configured on this server');
    }
    if (error?.code === 'FIREBASE_CONFIG_INVALID') {
      return sendError(res, 503, 'Phone sign-in server configuration is invalid');
    }
    if (error?.code === 'FIREBASE_TOKEN_INVALID') {
      return sendError(res, 401, 'Phone token is invalid or expired');
    }
    if (typeof error?.code === 'string' && error.code.startsWith('auth/')) {
      return sendError(res, 401, 'Phone token is invalid or expired');
    }
    return handleError(error, res, next);
  }
};

exports.getGoogleAuthConfig = (_req, res) => {
  const config = getFirebasePublicConfig();
  const enabled = Boolean(config.apiKey && config.projectId && config.authDomain);

  return sendSuccess(res, {
    enabled,
    ...config,
  });
};

exports.getProfile = async (req, res, next) => {
  try {
    const prisma = await getPrisma();
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return sendSuccess(res, user);
  } catch (error) {
    return next(error);
  }
};

exports.listUsers = async (req, res, next) => {
  try {
    const prisma = await getPrisma();
    const take = Math.min(Number.parseInt(req.query?.limit, 10) || 50, 200);
    const pageNumber = Math.max(Number.parseInt(req.query?.page, 10) || 1, 1);
    const skip = (pageNumber - 1) * take;
    const searchToken = String(req.query?.search || '').trim();

    const where = {};
    if (searchToken) {
      where.OR = [
        { name: { contains: searchToken } },
        { email: { contains: searchToken } },
        { role: { contains: searchToken } },
      ];
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          createdAt: true,
        },
        take,
        skip,
      }),
      prisma.user.count({ where }),
    ]);

    return sendSuccess(res, users, { total, page: pageNumber, limit: take });
  } catch (error) {
    return next(error);
  }
};

exports.updateRole = async (req, res, next) => {
  try {
    const { role } = roleSchema.parse(req.body);
    const prisma = await getPrisma();

    const updated = await prisma.user.update({
      where: { id: req.params.id },
      data: { role },
    });
    return sendSuccess(res, sanitizeUser(updated));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return sendError(res, 400, error.errors[0]?.message || 'Invalid payload');
    }
    if (error.code === 'P2025') {
      return sendError(res, 404, 'User not found');
    }
    return next(error);
  }
};

exports.forgotPassword = async (req, res, next) => {
  try {
    const { email } = forgotSchema.parse(req.body);
    const prisma = await getPrisma();

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return sendSuccess(res, {
        message: 'If that email exists, a reset link has been sent.',
      });
    }

    await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });

    const rawToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await prisma.passwordResetToken.create({
      data: {
        token: hashedToken,
        expiresAt,
        userId: user.id,
      },
    });

    const resetUrl = `${process.env.FRONTEND_URL || ''}/reset-password/${rawToken}`;

    return sendSuccess(res, {
      message: 'If that email exists, a reset link has been sent.',
      resetUrl,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return sendError(res, 400, error.errors[0]?.message || 'Invalid payload');
    }
    return next(error);
  }
};

exports.resetPassword = async (req, res, next) => {
  try {
    const { password } = resetSchema.parse(req.body);
    const prisma = await getPrisma();

    const hashedToken = crypto.createHash('sha256').update(req.params.token).digest('hex');

    const record = await prisma.passwordResetToken.findUnique({
      where: { token: hashedToken },
    });

    if (!record || record.expiresAt < new Date()) {
      return sendError(res, 400, 'Token is invalid or has expired.');
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    await prisma.user.update({
      where: { id: record.userId },
      data: { passwordHash },
    });

    await prisma.passwordResetToken.delete({ where: { id: record.id } });

    return sendSuccess(res, { message: 'Password has been reset successfully.' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return sendError(res, 400, error.errors[0]?.message || 'Invalid payload');
    }
    return next(error);
  }
};

exports.updateProfile = async (req, res, next) => {
  try {
    const updates = updateProfileSchema.parse(req.body);
    const prisma = await getPrisma();

    const updated = await prisma.user.update({
      where: { id: req.user.id },
      data: updates,
    });

    return sendSuccess(res, sanitizeUser(updated));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return sendError(res, 400, error.errors[0]?.message || 'Invalid payload');
    }
    return handleError(error, res, next);
  }
};

exports.changePassword = async (req, res, next) => {
  try {
    const payload = changePasswordSchema.parse(req.body);
    const prisma = await getPrisma();

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, passwordHash: true },
    });

    if (!user || !user.passwordHash) {
      return sendError(res, 404, 'User not found');
    }

    const isValid = await bcrypt.compare(payload.currentPassword, user.passwordHash);
    if (!isValid) {
      return sendError(res, 400, 'Current password is incorrect');
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(payload.newPassword, salt);

    await prisma.user.update({
      where: { id: req.user.id },
      data: { passwordHash },
    });

    return sendSuccess(res, { message: 'Password updated successfully.' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return sendError(res, 400, error.errors[0]?.message || 'Invalid payload');
    }
    return next(error);
  }
};
