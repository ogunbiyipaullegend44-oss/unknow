import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const apiPath = fileURLToPath(new URL('../server/index.js', import.meta.url));
const vitePath = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url));
const services = [
  {
    name: 'Research API',
    url: 'http://127.0.0.1:3001/api/health',
    isReady: (responseBody) => {
      try {
        return JSON.parse(responseBody).status === 'ok';
      } catch {
        return false;
      }
    },
    command: [apiPath],
  },
  {
    name: 'Vite frontend',
    url: 'http://127.0.0.1:5173/',
    isReady: (responseBody) => responseBody.includes('/@vite/client'),
    command: [vitePath, ...process.argv.slice(2)],
  },
];

let stopping = false;
const children = [];

function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = exitCode;
  for (const { process: child } of children) {
    if (child.exitCode === null && child.signalCode === null) child.kill();
  }
}

async function serviceIsReady(service) {
  try {
    const response = await fetch(service.url, { signal: AbortSignal.timeout(1500) });
    return response.ok && service.isReady(await response.text());
  } catch (error) {
    if (error.cause?.code !== 'ECONNREFUSED' && error.name !== 'TimeoutError') {
      console.warn(`Could not check whether ${service.name} is already running: ${error.message}`);
    }
    return false;
  }
}

async function start() {
  const readiness = await Promise.all(services.map(serviceIsReady));

  services.forEach((service, index) => {
    if (readiness[index]) {
      console.log(`${service.name} is already running at ${service.url}.`);
      return;
    }

    children.push({
      name: service.name,
      process: spawn(process.execPath, service.command, { stdio: 'inherit' }),
    });
  });

  for (const { name, process: child } of children) {
    child.on('error', (error) => {
      console.error(`Could not start ${name}: ${error.message}`);
      if (name === 'Vite frontend') stop(1);
    });
    child.on('exit', (code, signal) => {
      if (!stopping) {
        const result = signal ? `after ${signal}` : `with exit code ${code}`;
        if (name === 'Research API') {
          console.error(`${name} stopped ${result}; Vite will continue. Check whether port 3001 is already in use.`);
        } else {
          console.error(`${name} stopped ${result}.`);
          stop(code ?? 1);
        }
      }
    });
  }

  if (children.length === 0) {
    console.log('All development services are already running.');
  }
}

process.once('SIGINT', () => stop(0));
process.once('SIGTERM', () => stop(0));

start().catch((error) => {
  console.error(`Could not start development services: ${error.message}`);
  stop(1);
});
