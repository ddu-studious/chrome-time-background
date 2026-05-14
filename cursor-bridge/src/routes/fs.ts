import type { FastifyInstance } from 'fastify';
import { readdirSync, statSync } from 'node:fs';
import { resolve, basename, sep } from 'node:path';
import { execSync } from 'node:child_process';
import { homedir } from 'node:os';

interface DirEntry {
  name: string;
  path: string;
  isDir: boolean;
}

function listDir(dirPath: string): DirEntry[] {
  try {
    const entries = readdirSync(dirPath, { withFileTypes: true });
    return entries
      .filter(e => !e.name.startsWith('.'))
      .filter(e => e.isDirectory())
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(e => ({
        name: e.name,
        path: resolve(dirPath, e.name),
        isDir: true,
      }));
  } catch {
    return [];
  }
}

function completePath(prefix: string): DirEntry[] {
  if (!prefix) return listDir(homedir());

  const resolved = prefix.startsWith('~')
    ? resolve(homedir(), prefix.slice(2))
    : resolve(prefix);

  try {
    const stat = statSync(resolved);
    if (stat.isDirectory()) {
      if (prefix.endsWith(sep) || prefix.endsWith('/')) {
        return listDir(resolved);
      }
      const parent = resolve(resolved, '..');
      const name = basename(resolved);
      return listDir(parent).filter(e => e.name.startsWith(name));
    }
  } catch { /* path doesn't exist fully, try parent */ }

  const parent = resolve(resolved, '..');
  const partial = basename(resolved).toLowerCase();
  try {
    return listDir(parent).filter(e => e.name.toLowerCase().startsWith(partial));
  } catch {
    return [];
  }
}

export async function fsRoutes(fastify: FastifyInstance) {
  fastify.get<{ Querystring: { path?: string } }>(
    '/fs/list',
    async (request) => {
      const dirPath = request.query.path || homedir();
      const entries = listDir(dirPath);
      const parentPath = resolve(dirPath, '..');
      return {
        current: dirPath,
        parent: parentPath !== dirPath ? parentPath : null,
        entries,
      };
    }
  );

  fastify.get<{ Querystring: { prefix?: string } }>(
    '/fs/complete',
    async (request) => {
      const prefix = request.query.prefix || '';
      const results = completePath(prefix);
      return { results: results.slice(0, 20) };
    }
  );

  fastify.post('/fs/dialog', async (_request, reply) => {
    try {
      const result = execSync(
        `osascript -e 'POSIX path of (choose folder with prompt "选择工作目录")'`,
        { encoding: 'utf-8', timeout: 60000 }
      ).trim();
      const cleanPath = result.endsWith('/') ? result.slice(0, -1) : result;
      return { path: cleanPath };
    } catch (err: any) {
      if (err.status === 1 || err.message?.includes('User canceled')) {
        return reply.code(200).send({ path: null, cancelled: true });
      }
      return reply.code(500).send({ error: 'Failed to open folder dialog' });
    }
  });
}
