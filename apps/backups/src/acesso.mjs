// Confere o token do Cloudflare Access (Cf-Access-Jwt-Assertion): assinatura RS256 pelas chaves da equipe, emissor,
// audiência do app e validade. O Access já barra na borda; isto impede que um erro de configuração abra a página.
const b64url = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')), (c) => c.charCodeAt(0))
const json = (s) => JSON.parse(new TextDecoder().decode(b64url(s)))

let cache = { url: '', ate: 0, chaves: [] }

// novo = true ignora o cache (kid desconhecido: o Access pode ter trocado a chave dentro da hora do cache).
async function chaves(url, fetchFn, novo = false) {
  if (!novo && cache.url === url && cache.ate > Date.now()) return cache.chaves
  const r = await fetchFn(url)
  if (!r.ok) throw new Error(`certs HTTP ${r.status}`)
  cache = { url, ate: Date.now() + 3600_000, chaves: (await r.json()).keys ?? [] }
  return cache.chaves
}

// Devolve o e-mail de quem entrou, ou null.
export async function usuarioDoAccess(request, env, { fetchFn = fetch, agora = Date.now() } = {}) {
  const equipe = env.ACCESS_EQUIPE
  const aud = env.ACCESS_AUD
  const token = request.headers.get('Cf-Access-Jwt-Assertion')
  if (!equipe || !aud || !token) return null
  const partes = token.split('.')
  if (partes.length !== 3) return null
  try {
    const cabecalho = json(partes[0])
    const corpo = json(partes[1])
    const emissor = `https://${equipe}.cloudflareaccess.com`
    const auds = Array.isArray(corpo.aud) ? corpo.aud : [corpo.aud]
    if (cabecalho.alg !== 'RS256' || corpo.iss !== emissor || !auds.includes(aud)) return null
    if (!(corpo.exp * 1000 > agora) || (corpo.nbf && corpo.nbf * 1000 > agora + 60_000)) return null
    const certs = `${emissor}/cdn-cgi/access/certs`
    const achar = (lista) => lista.find((k) => k.kid === cabecalho.kid)
    const jwk = achar(await chaves(certs, fetchFn)) ?? achar(await chaves(certs, fetchFn, true))
    if (!jwk) return null
    const chave = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify'])
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', chave, b64url(partes[2]), new TextEncoder().encode(`${partes[0]}.${partes[1]}`))
    return ok ? corpo.email || null : null
  } catch {
    return null
  }
}
