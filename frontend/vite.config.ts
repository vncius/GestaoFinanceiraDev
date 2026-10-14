import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Lê os cabeçalhos da regra "/*" de public/_headers (formato do Cloudflare
// Pages) para o `vite preview` servir o build com os mesmos cabeçalhos de
// produção — é como testar a CSP localmente.
function cloudflareHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  let inRule = false;
  for (const line of readFileSync('public/_headers', 'utf8').split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      inRule = line.trim() === '/*';
      continue;
    }
    if (!inRule) continue;
    const idx = line.indexOf(':');
    headers[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  // HSTS/upgrade-insecure-requests não fazem sentido em http://localhost.
  delete headers['Strict-Transport-Security'];
  if (headers['Content-Security-Policy']) {
    headers['Content-Security-Policy'] = headers['Content-Security-Policy'].replace(
      /;\s*upgrade-insecure-requests/,
      '',
    );
  }
  return headers;
}

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3101,
  },
  preview: {
    port: 3101,
    headers: cloudflareHeaders(),
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
  },
});
