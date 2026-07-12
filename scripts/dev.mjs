import { spawn } from 'node:child_process';

const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const children = [];
let shuttingDown = false;

const startProcess = (label, args) => {
  const child = spawn(npmCmd, args, {
    stdio: 'inherit',
    shell: true,
  });

  child.on('error', (error) => {
    console.error(`[${label}] failed to start`, error);
    shutdown(1);
  });

  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    if (code === 0) {
      console.log(`[${label}] exited cleanly`);
      shutdown(0);
      return;
    }
    console.error(`[${label}] exited with code ${code ?? 'null'} signal ${signal ?? 'null'}`);
    shutdown(typeof code === 'number' ? code : 1);
  });

  children.push(child);
  return child;
};

const shutdown = (exitCode = 0) => {
  if (shuttingDown) return;
  shuttingDown = true;

  for (const child of children) {
    if (!child.killed) {
      child.kill('SIGINT');
    }
  }

  setTimeout(() => {
    process.exit(exitCode);
  }, 200);
};

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

startProcess('api', ['run', 'dev:api']);
startProcess('web', ['run', 'dev:web']);
