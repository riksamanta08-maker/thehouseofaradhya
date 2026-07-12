const { Pool } = require('@neondatabase/serverless');

const globalForDB = globalThis;

const getPool = () => {
    if (globalForDB.__marvellaPool) {
        return globalForDB.__marvellaPool;
    }

    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
        throw new Error('DATABASE_URL environment variable is not set');
    }

    const pool = new Pool({ connectionString });

    if (process.env.NODE_ENV !== 'production') {
        globalForDB.__marvellaPool = pool;
    }

    return pool;
};

const pool = getPool();

// Export pool for direct queries
module.exports = {
    pool,
    getPool,
};
