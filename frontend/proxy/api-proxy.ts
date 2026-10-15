// Partes puras do proxy /api (functions/api/[[path]].ts), separadas para
// teste. Fica fora de functions/: lá todo arquivo vira rota do Pages.

export const API_PREFIX = '/api';

/**
 * URL do backend para uma requisição recebida em /api/*.
 *
 * O caminho é copiado com o setter `pathname`, que nunca troca o host. Antes
 * a URL era resolvida com `new URL('/' + caminho, API_ORIGIN)`: um caminho
 * começando com barra (`/api//outro-site.com`) virava `//outro-site.com`,
 * URL relativa ao protocolo, e o proxy mandava cookie de sessão e
 * X-Proxy-Secret para outro host (achado A1 do relatório de segurança).
 */
export function upstreamUrl(requestUrl: string, apiOrigin: string): URL {
  const incoming = new URL(requestUrl);
  const origin = new URL(apiOrigin).origin;
  const target = new URL(origin);
  const path = incoming.pathname.startsWith(API_PREFIX)
    ? incoming.pathname.slice(API_PREFIX.length)
    : incoming.pathname;
  target.pathname = path || '/';
  target.search = incoming.search;
  // Defesa em profundidade: nada acima deveria mudar a origem.
  if (target.origin !== origin) throw new Error('Destino do proxy fora de API_ORIGIN');
  return target;
}

/**
 * Cabeçalhos repassados ao backend. IP real do cliente (rate limit e
 * auditoria): visto do Render, quem conecta é o Cloudflare; o segredo prova
 * que o X-Client-IP veio deste proxy e não de alguém chamando o backend
 * direto. Valores enviados pelo próprio navegador nesses cabeçalhos são
 * descartados.
 */
export function upstreamHeaders(incoming: Headers, sharedSecret: string | undefined): Headers {
  const headers = new Headers(incoming);
  headers.delete('host');
  headers.delete('x-client-ip');
  headers.delete('x-proxy-secret');
  const clientIp = incoming.get('cf-connecting-ip');
  if (sharedSecret && clientIp) {
    headers.set('x-client-ip', clientIp);
    headers.set('x-proxy-secret', sharedSecret);
  }
  return headers;
}
