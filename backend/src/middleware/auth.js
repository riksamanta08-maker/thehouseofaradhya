const { getPrisma } = require('../db/prismaClient');
const { verifyToken } = require('../utils/jwt');

const parseToken = (header = '') => {
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return null;
  }
  return token;
};

const protect = async (req, res, next) => {
  try {
    const token = parseToken(req.headers.authorization);
    if (!token) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const decoded = verifyToken(token);
    if (!decoded?.id) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const prisma = await getPrisma();
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: { id: true, email: true, role: true, name: true },
    });

    if (!user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};

const requireRole =
  (...roles) =>
  (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    next();
  };

module.exports = {
  protect,
  requireRole,
};
