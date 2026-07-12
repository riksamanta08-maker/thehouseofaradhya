const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.join(__dirname, '..');
const envPath = path.join(projectRoot, '.env');
const examplePath = path.join(projectRoot, '.env.example');

try {
  if (fs.existsSync(envPath)) {
    return;
  }

  if (fs.existsSync(examplePath)) {
    fs.copyFileSync(examplePath, envPath);
  } else {
    const defaultEnv = `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/marvelle
PORT=5000
NODE_ENV=development
JWT_SECRET=dev_secret
FRONTEND_URL=http://localhost:5173
`;
    fs.writeFileSync(envPath, defaultEnv, 'utf8');
  }

  console.log('[init-env] Created .env file with development defaults. Update it with real credentials when needed.');
} catch (error) {
  console.warn('[init-env] Failed to prepare .env file:', error);
}
