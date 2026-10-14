/**
 * Cloudflare Pages Function — reverse proxy same-origin para o backend (Render).
 *
 * Sem isso, o cookie de sessão (httpOnly, SameSite=None) é um cookie de
 * terceiro do ponto de vista do navegador (frontend e backend são domínios
 * registráveis diferentes) — Safari/iOS bloqueia cookies de terceiro
 * incondicionalmente (ITP), o que quebra o login em navegadores mobile.
 *
 * Proxiando `/api/*` para o backend a partir do próprio domínio do
 * frontend, o navegador só enxerga um domínio (o do Cloudflare Pages): a
 * chamada deixa de ser cross-site e o cookie passa a ser first-party.
 *
 * Requer a env var `API_ORIGIN` configurada no projeto Cloudflare Pages
 * (Settings → Environment variables), com a URL pública do backend no
 * Render (ex.: https://gestao-financeira-backend.onrender.com).
 */
interface Env {
  API_ORIGIN: string;
  /** Segredo compartilhado com o backend (mesma env var no Render). */
  PROXY_SHARED_SECRET?: string;
}

export const onRequest: PagesFunction<Env> = async ({ request, env, params }) => {
  if (!env.API_ORIGIN) {
    return new Response('API_ORIGIN não configurada no ambiente do Cloudflare Pages', {
      status: 500,
    });
  }

  const incomingUrl = new URL(request.url);
  const segments = params.path;
  const path = Array.isArray(segments) ? segments.join('/') : (segments ?? '');
  const targetUrl = new URL(`/${path}`, env.API_ORIGIN);
  targetUrl.search = incomingUrl.search;

  const headers = new Headers(request.headers);
  headers.delete('host');

  // IP real do cliente para o backend (rate limit e auditoria). Visto do
  // Render, quem conecta é o Cloudflare; o segredo prova que o X-Client-IP
  // veio deste proxy e não de alguém chamando o backend direto. Valores
  // enviados pelo próprio navegador nesses cabeçalhos são descartados.
  headers.delete('x-client-ip');
  headers.delete('x-proxy-secret');
  const clientIp = request.headers.get('cf-connecting-ip');
  if (env.PROXY_SHARED_SECRET && clientIp) {
    headers.set('x-client-ip', clientIp);
    headers.set('x-proxy-secret', env.PROXY_SHARED_SECRET);
  }

  const hasBody = !['GET', 'HEAD'].includes(request.method);
  const upstreamRequest = new Request(targetUrl.toString(), {
    method: request.method,
    headers,
    body: hasBody ? request.body : undefined,
    redirect: 'manual',
  });

  const upstreamResponse = await fetch(upstreamRequest);

  const responseHeaders = new Headers(upstreamResponse.headers);
  responseHeaders.delete('set-cookie');

  const proxiedResponse = new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: responseHeaders,
  });

  // `Headers` padrão colapsa múltiplos `Set-Cookie` numa string só (inválido
  // para cookies). O runtime do Cloudflare expõe `getSetCookie()` para ler
  // cada um separadamente e o `Response` deles aceita múltiplos `append`.
  const rawHeaders = upstreamResponse.headers as Headers & { getSetCookie?: () => string[] };
  const setCookies =
    typeof rawHeaders.getSetCookie === 'function'
      ? rawHeaders.getSetCookie()
      : rawHeaders.get('set-cookie')
        ? [rawHeaders.get('set-cookie') as string]
        : [];
  for (const cookie of setCookies) {
    proxiedResponse.headers.append('set-cookie', cookie);
  }

  return proxiedResponse;
};
