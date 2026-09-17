import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

function loadEnvFile() {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const envPath = resolve(__dirname, '..', '.env');
  try {
    const content = readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    // .env file is optional
  }
}

loadEnvFile();

export const config = {
  port: parseInt(process.env.BRIDGE_PORT || '19840', 10),
  host: process.env.BRIDGE_HOST || '127.0.0.1',
  maxAgents: parseInt(process.env.BRIDGE_MAX_AGENTS || '10', 10),
  defaultModel: process.env.BRIDGE_DEFAULT_MODEL || 'composer-2',
  logLevel: (process.env.BRIDGE_LOG_LEVEL || 'info') as 'debug' | 'info' | 'warn' | 'error',
  logFile: process.env.BRIDGE_LOG_FILE || '',
  cdpPort: parseInt(process.env.CDP_PORT || '9222', 10),
  multiUser: process.env.BRIDGE_MULTI_USER === 'true',
};

export function validateConfig() {
  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) throw new Error('Bridge 端口无效');
}
