import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const apiPath = fileURLToPath(new URL('../server/index.js', import.meta.url));
const vitePath = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url));
const children = [
  spawn(process.execPath, [apiPath], { stdio: 'inherit' }),
  spawn(process.execPath, [vitePath, ...process.argv.slice(2)], { stdio: 'inherit' }),
];

let stopping = false;

function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = exitCode;
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) child.kill();
  }
}

for (const child of children) {
  child.on('error', (error) => {
    console.error(`Could not start development service: ${error.message}`);
    stop(1);
  });
  child.on('exit', (code, signal) => {
    if (!stopping) {
      console.error(
        `Development service stopped${signal ? ` after ${signal}` : ` with exit code ${code}`}.`,
      );
      stop(code ?? 1);
    }
  });
}

process.once('SIGINT', () => stop(0));
process.once('SIGTERM', () => stop(0));
