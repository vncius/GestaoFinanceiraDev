// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { upstreamHeaders, upstreamUrl } from './api-proxy';

const API_ORIGIN = 'https://backend.example.com';
const APP = 'https://app.example.com';

describe('upstreamUrl', () => {
  it('troca o prefixo /api pela origem do backend, mantendo caminho e query', () => {
    expect(upstreamUrl(`${APP}/api/cash-flow/payments/abc?month=3&year=2026`, API_ORIGIN).href).toBe(
      `${API_ORIGIN}/cash-flow/payments/abc?month=3&year=2026`,
    );
  });

  it('/api sozinho vai para a raiz do backend', () => {
    expect(upstreamUrl(`${APP}/api`, API_ORIGIN).href).toBe(`${API_ORIGIN}/`);
  });

  it('ignora caminho e barra final do API_ORIGIN, como antes', () => {
    expect(upstreamUrl(`${APP}/api/health`, `${API_ORIGIN}/qualquer/`).href).toBe(`${API_ORIGIN}/health`);
  });

  it('preserva o caminho já codificado sem codificar de novo', () => {
    expect(upstreamUrl(`${APP}/api/categories/a%20b`, API_ORIGIN).pathname).toBe('/categories/a%20b');
  });

  // Achado A1 do relatório de segurança: com new URL('/' + caminho, origem),
  // estes caminhos viravam URLs relativas ao protocolo apontando para outro host.
  it.each([
    '/api//evil.com/x',
    '/api///evil.com',
    '/api/\\evil.com',
    '/api//\\evil.com',
    '/api/%09/evil.com',
    '/api/%5Cevil.com',
    '/api/%2F%2Fevil.com',
    '/api/%2e%2e/%2e%2e//evil.com',
    '/api/@evil.com',
    '/api/:evil.com',
  ])('nunca sai do backend: %s', (path) => {
    const url = upstreamUrl(`${APP}${path}`, API_ORIGIN);
    expect(url.origin).toBe(API_ORIGIN);
    expect(url.host).toBe('backend.example.com');
  });
});

describe('upstreamHeaders', () => {
  it('descarta host e os cabeçalhos de IP/segredo enviados pelo navegador', () => {
    const headers = upstreamHeaders(
      new Headers({
        host: 'app.example.com',
        'x-client-ip': '6.6.6.6',
        'x-proxy-secret': 'forjado',
        cookie: 'session=abc',
      }),
      undefined,
    );
    expect(headers.get('host')).toBeNull();
    expect(headers.get('x-client-ip')).toBeNull();
    expect(headers.get('x-proxy-secret')).toBeNull();
    expect(headers.get('cookie')).toBe('session=abc');
  });

  it('com segredo, envia o IP do Cloudflare e o segredo', () => {
    const headers = upstreamHeaders(
      new Headers({ 'cf-connecting-ip': '200.1.2.3', 'x-client-ip': '6.6.6.6' }),
      'segredo',
    );
    expect(headers.get('x-client-ip')).toBe('200.1.2.3');
    expect(headers.get('x-proxy-secret')).toBe('segredo');
  });

  it('sem segredo, não envia IP', () => {
    const headers = upstreamHeaders(new Headers({ 'cf-connecting-ip': '200.1.2.3' }), undefined);
    expect(headers.get('x-client-ip')).toBeNull();
  });
});
