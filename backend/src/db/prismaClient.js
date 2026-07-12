const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaMariaDb } = require('@prisma/adapter-mariadb');
const mariadb = require('mariadb');

const globalForPrisma = globalThis;
const CONNECTION_ENV_KEYS = [
  'DATABASE_URL',
  'MYSQL_URL',
  'MYSQL_DATABASE_URL',
  'MARIADB_URL',
  'DB_URL',
  'POSTGRES_PRISMA_URL',
  'POSTGRES_URL_NON_POOLING',
  'POSTGRES_URL',
  'NEON_DATABASE_URL',
  'NEON_POSTGRES_URL',
  'DIRECT_URL',
];
const READ_ACTIONS = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
]);
const RETRYABLE_ERROR_PATTERNS = [
  "can't reach database server",
  'connect timeout',
  'connection terminated unexpectedly',
  'econnreset',
  'etimedout',
  'socket hang up',
];
const MAX_READ_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 350;
const DEFAULT_CONNECT_TIMEOUT_SECONDS = '15';
const MYSQL_CONNECT_TIMEOUT_MS = 15000;
const MYSQL_ACQUIRE_TIMEOUT_MS = 15000;
const MYSQL_CONNECTION_LIMIT = 2;

let prisma = globalForPrisma.__marvellaPrisma || null;
let prismaInitPromise = globalForPrisma.__marvellaPrismaInit || null;
let activeConnectionString = globalForPrisma.__marvellaPrismaConnection || null;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const firstErrorLine = (error) => {
  const message = String(error?.message || 'Unknown error');
  const rawQueryMessage = message.match(/Message:\s*`([^`]+)`/);
  if (rawQueryMessage?.[1]) return rawQueryMessage[1];
  return (
    message
      .split('\n')
      .map((line) => line.trim())
      .find(Boolean) || 'Unknown error'
  );
};
const isLocalHost = (hostname) => {
  const value = String(hostname || '').toLowerCase();
  return value === 'localhost' || value === '127.0.0.1' || value === '::1';
};

const getConnectionProtocol = (connectionString) => {
  try {
    return new URL(connectionString).protocol.replace(/:$/, '').toLowerCase();
  } catch {
    return '';
  }
};

const createMariaDbConfig = (connectionString) => {
  const parsed = new URL(connectionString);
  const socketPath = parsed.searchParams.get('socketPath');
  const config = {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 3306,
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: decodeURIComponent(parsed.pathname.replace(/^\/+/, '')),
    prepareCacheLength: 0,
    connectTimeout: MYSQL_CONNECT_TIMEOUT_MS,
    acquireTimeout: MYSQL_ACQUIRE_TIMEOUT_MS,
    connectionLimit: MYSQL_CONNECTION_LIMIT,
  };
  if (socketPath) {
    config.socketPath = socketPath;
    delete config.host;
    delete config.port;
  }
  return config;
};

const createDiagnosticMariaDbConfig = (connectionString) => ({
  ...createMariaDbConfig(connectionString),
  connectTimeout: 3000,
  acquireTimeout: 3000,
  connectionLimit: 1,
});

const deriveMysqlLocalhostCandidate = (connectionString) => {
  try {
    const parsed = new URL(connectionString);
    if (!/^(mysql|mariadb):$/i.test(parsed.protocol)) return null;
    if (String(parsed.hostname || '').toLowerCase() !== 'localhost') return null;
    parsed.hostname = '127.0.0.1';
    return parsed.toString();
  } catch {
    return null;
  }
};

const deriveMysqlSocketCandidate = (connectionString) => {
  try {
    const parsed = new URL(connectionString);
    if (!/^(mysql|mariadb):$/i.test(parsed.protocol)) return null;
    if (String(parsed.hostname || '').toLowerCase() !== 'localhost') return null;
    if (parsed.searchParams.get('socketPath')) return null;
    parsed.searchParams.set('socketPath', '/var/lib/mysql/mysql.sock');
    return parsed.toString();
  } catch {
    return null;
  }
};

const deriveMysqlHostCandidate = (connectionString, host) => {
  const nextHost = String(host || '').trim();
  if (!nextHost) return null;
  try {
    const parsed = new URL(connectionString);
    if (!/^(mysql|mariadb):$/i.test(parsed.protocol)) return null;
    if (String(parsed.hostname || '').toLowerCase() !== 'localhost') return null;
    if (parsed.hostname === nextHost) return null;
    parsed.hostname = nextHost;
    parsed.searchParams.delete('socketPath');
    return parsed.toString();
  } catch {
    return null;
  }
};

const normalizeConnectionString = (value) => {
  if (!value) return null;
  let trimmed = String(value).trim();
  while (
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
  ) {
    trimmed = trimmed.slice(1, -1).trim();
  }
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (
      /^(mysql|mariadb):$/i.test(parsed.protocol) &&
      String(parsed.hostname || '').toLowerCase() === 'host'
    ) {
      parsed.hostname = 'localhost';
      return parsed.toString();
    }
    if (!/^postgres(ql)?:$/i.test(parsed.protocol)) {
      return trimmed;
    }
    if (!parsed.searchParams.get('sslmode') && !isLocalHost(parsed.hostname)) {
      parsed.searchParams.set('sslmode', 'require');
    }
    if (!parsed.searchParams.get('connect_timeout')) {
      parsed.searchParams.set('connect_timeout', DEFAULT_CONNECT_TIMEOUT_SECONDS);
    }
    if (parsed.searchParams.get('channel_binding') === 'require') {
      // "require" can fail against some clients/providers; "prefer" is more resilient.
      parsed.searchParams.set('channel_binding', 'prefer');
    }
    if (parsed.hostname.includes('-pooler.') && !parsed.searchParams.get('pgbouncer')) {
      parsed.searchParams.set('pgbouncer', 'true');
    }
    return parsed.toString();
  } catch {
    return trimmed;
  }
};

const deriveDirectCandidate = (connectionString) => {
  if (!connectionString) return null;
  try {
    const parsed = new URL(connectionString);
    if (!parsed.hostname.includes('-pooler.')) return null;
    parsed.hostname = parsed.hostname.replace('-pooler.', '.');
    parsed.searchParams.delete('pgbouncer');
    return normalizeConnectionString(parsed.toString());
  } catch {
    return null;
  }
};

const resolveConnectionCandidates = () => {
  const seen = new Set();
  const candidates = [];

  const pushCandidate = (rawValue) => {
    const normalized = normalizeConnectionString(rawValue);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    candidates.push(normalized);

    const direct = deriveDirectCandidate(normalized);
    if (direct && !seen.has(direct)) {
      seen.add(direct);
      candidates.push(direct);
    }

    const mysqlSocket = deriveMysqlSocketCandidate(normalized);
    if (mysqlSocket && !seen.has(mysqlSocket)) {
      seen.add(mysqlSocket);
      candidates.push(mysqlSocket);
    }

    const mysqlLocalhost = deriveMysqlLocalhostCandidate(normalized);
    if (mysqlLocalhost && !seen.has(mysqlLocalhost)) {
      seen.add(mysqlLocalhost);
      candidates.push(mysqlLocalhost);
    }

    const hostingerHost = deriveMysqlHostCandidate(normalized, process.env.HOSTINGER_FTP_HOST);
    if (hostingerHost && !seen.has(hostingerHost)) {
      seen.add(hostingerHost);
      candidates.push(hostingerHost);
    }
  };

  const primaryValue = CONNECTION_ENV_KEYS.map((key) => process.env[key]).find(
    (value) => String(value || '').trim(),
  );
  if (primaryValue) {
    pushCandidate(primaryValue);
    return candidates;
  }

  for (const key of CONNECTION_ENV_KEYS) {
    pushCandidate(process.env[key]);
  }

  return candidates;
};

const redactConnectionString = (connectionString) => {
  if (!connectionString) return '(missing)';
  try {
    const parsed = new URL(connectionString);
    const queryKeys = [...parsed.searchParams.keys()].join(',');
    return `${parsed.protocol}//${parsed.hostname}${parsed.port ? `:${parsed.port}` : ''}${parsed.pathname}${queryKeys ? `?${queryKeys}` : ''}`;
  } catch {
    return '(invalid connection string)';
  }
};

const isRetryableConnectionError = (error) => {
  if (!error) return false;
  if (String(error.code || '').toUpperCase() === 'P1001') return true;
  const message = String(error.message || '').toLowerCase();
  return RETRYABLE_ERROR_PATTERNS.some((pattern) => message.includes(pattern));
};

const attachReadRetryExtension = (client) =>
  client.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!READ_ACTIONS.has(operation)) {
            return query(args);
          }

          let attempt = 0;
          for (;;) {
            try {
              return await query(args);
            } catch (error) {
              attempt += 1;
              const shouldRetry =
                attempt < MAX_READ_RETRIES && isRetryableConnectionError(error);
              if (!shouldRetry) throw error;

              const delay = BASE_RETRY_DELAY_MS * attempt;
              if (process.env.NODE_ENV !== 'production') {
                console.warn(
                  `[DB] Retry ${model || 'raw'}.${operation || 'query'} (${attempt + 1}/${MAX_READ_RETRIES}) after transient error: ${firstErrorLine(error)}`,
                );
              }
              await sleep(delay);
            }
          }
        },
      },
    },
});

const createPrismaClient = (connectionString) => {
  const protocol = getConnectionProtocol(connectionString);
  const adapter =
    protocol === 'mysql' || protocol === 'mariadb'
      ? new PrismaMariaDb(createMariaDbConfig(connectionString))
      : new PrismaPg({ connectionString });
  const baseClient = new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });
  return attachReadRetryExtension(baseClient);
};

const ensurePrisma = async () => {
  if (prisma) return prisma;
  if (prismaInitPromise) return prismaInitPromise;

  prismaInitPromise = (async () => {
    const candidates = resolveConnectionCandidates();
    if (!candidates.length) {
      const error = new Error(
        'Database is not configured. Set DATABASE_URL or MYSQL_URL.',
      );
      error.status = 503;
      throw error;
    }

    let lastError = null;
    for (const connectionString of candidates) {
      const client = createPrismaClient(connectionString);
      try {
        await client.$queryRawUnsafe('SELECT 1');
        prisma = client;
        activeConnectionString = connectionString;
        if (process.env.NODE_ENV !== 'production') {
          globalForPrisma.__marvellaPrisma = prisma;
          globalForPrisma.__marvellaPrismaConnection = activeConnectionString;
          console.log(
            `[DB] Prisma connected via ${redactConnectionString(activeConnectionString)}`,
          );
        }
        return prisma;
      } catch (error) {
        lastError = error;
        await client.$disconnect().catch(() => {});
        if (process.env.NODE_ENV !== 'production') {
          console.warn(
            `[DB] Connection failed via ${redactConnectionString(connectionString)}: ${firstErrorLine(error)}`,
          );
        }
      }
    }

    const error = new Error(
      `Unable to connect to database using configured connection strings. Last error: ${firstErrorLine(lastError)}`,
    );
    error.status = 503;
    throw error;
  })();

  if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.__marvellaPrismaInit = prismaInitPromise;
  }

  try {
    return await prismaInitPromise;
  } finally {
    prismaInitPromise = null;
    if (process.env.NODE_ENV !== 'production') {
      globalForPrisma.__marvellaPrismaInit = null;
    }
  }
};

const getPrisma = async () => ensurePrisma();

const getDatabaseDiagnostics = async () => {
  const rawValues = CONNECTION_ENV_KEYS
    .map((key) => ({ key, value: process.env[key] }))
    .filter((entry) => String(entry.value || '').trim());
  const candidates = resolveConnectionCandidates();
  const results = [];

  for (const connectionString of candidates) {
    const protocol = getConnectionProtocol(connectionString);
    const redacted = redactConnectionString(connectionString);
    if (protocol !== 'mysql' && protocol !== 'mariadb') {
      results.push({ candidate: redacted, skipped: `protocol ${protocol || 'unknown'}` });
      continue;
    }

    const startedAt = Date.now();
    let connection = null;
    try {
      connection = await mariadb.createConnection(createDiagnosticMariaDbConfig(connectionString));
      await connection.query('SELECT 1 AS ok');
      results.push({
        candidate: redacted,
        ok: true,
        elapsedMs: Date.now() - startedAt,
      });
    } catch (error) {
      results.push({
        candidate: redacted,
        ok: false,
        elapsedMs: Date.now() - startedAt,
        code: error?.code || null,
        message: firstErrorLine(error),
      });
    } finally {
      if (connection) await connection.end().catch(() => {});
    }
  }

  return {
    configuredKeys: rawValues.map((entry) => entry.key),
    candidateCount: candidates.length,
    candidates: results,
  };
};

const warmUp = async () => {
  try {
    const start = Date.now();
    const client = await ensurePrisma();
    await client.$queryRawUnsafe('SELECT 1');
    console.log(`[DB] Prisma warm-up done in ${Date.now() - start}ms`);
  } catch (err) {
    console.warn('[DB] Prisma warm-up failed (will retry on first request):', err.message);
  }
};

const disconnect = async () => {
  if (!prisma) return;
  await prisma.$disconnect();
  prisma = null;
  activeConnectionString = null;
  if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.__marvellaPrisma = null;
    globalForPrisma.__marvellaPrismaConnection = null;
  }
};

module.exports = {
  getPrisma,
  disconnect,
  warmUp,
  getDatabaseDiagnostics,
};
