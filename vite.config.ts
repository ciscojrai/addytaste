/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type Plugin } from 'vite';

// Dev only: serve /api/* with the same handler Netlify would run, loading keys from .env into process.env.
function apiPlugin(): Plugin {
  return {
    name: 'addytaste-api',
    configureServer(server) {
      const env = loadEnv('development', process.cwd(), '');
      for (const k of ['GEMINI_API_KEY', 'QLOO_API_KEY', 'QLOO_BASE_URL', 'STAY22_AID', 'GEMINI_MODEL', 'QLOO_LOG_FILE']) if (env[k]) process.env[k] = env[k];
      server.middlewares.use('/api', async (req, res) => {
        const chunks: Buffer[] = [];
        for await (const c of req) chunks.push(c as Buffer);
        const body = chunks.length ? Buffer.concat(chunks) : undefined;
        const { handleApi } = (await server.ssrLoadModule('/server/api.ts')) as typeof import('./server/api');
        const r = await handleApi(
          new Request(`http://localhost/api${req.url ?? ''}`, { method: req.method, headers: req.headers as Record<string, string>, body: req.method === 'GET' ? undefined : body }),
          process.env,
        );
        res.statusCode = r.status;
        r.headers.forEach((v, k) => res.setHeader(k, v));
        res.end(Buffer.from(await r.arrayBuffer()));
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), apiPlugin()],
  test: { include: ['test/**/*.test.ts'], environment: 'node' },
});
