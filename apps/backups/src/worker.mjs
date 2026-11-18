// Página dos backups do PROD para o time: lista e baixa as cópias do bucket R2 (gravadas pelo job r2 do backup-prod.yml).
// Login pelo Cloudflare Access (lista de e-mails no painel do Zero Trust); o Worker confere o token de novo (acesso.mjs).
// As cópias são zips com senha: quem baixa ainda precisa da BACKUP_SENHA. Cada download vira um objeto vazio em
// registros/downloads/ (metadata: e-mail e cópia; chave com o tempo invertido, para a listagem vir da mais nova). A rotação
// do backup-prod.yml ignora chaves fora do padrão das cópias.
import { usuarioDoAccess } from './acesso.mjs'
import { agrupar, paginaHtml, PADRAO } from './pagina.mjs'
import { VERSAO } from './version.mjs'

const SEGURANCA = {
  'Content-Security-Policy': "default-src 'none'; img-src 'self'; font-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex',
}

const resposta = (corpo, status = 200, extra = {}) => new Response(corpo, { status, headers: { ...SEGURANCA, 'Content-Type': 'text/plain; charset=utf-8', ...extra } })

const REGISTROS = 'registros/downloads/'
const chaveRegistro = (ms) => `${REGISTROS}${String(1e13 - ms).padStart(13, '0')}-${crypto.randomUUID().slice(0, 8)}`

async function downloadsRecentes(bucket) {
  const r = await bucket.list({ prefix: REGISTROS, limit: 15, include: ['customMetadata'] })
  return r.objects.map((o) => ({ ms: 1e13 - Number(o.key.slice(REGISTROS.length, REGISTROS.length + 13)), ...o.customMetadata }))
}

async function listar(bucket) {
  const porPasta = await Promise.all(['diario/', 'semanal/', 'mensal/'].map(async (prefix) => {
    const objetos = []
    let cursor
    do {
      const r = await bucket.list({ prefix, cursor })
      objetos.push(...r.objects)
      cursor = r.truncated ? r.cursor : undefined
    } while (cursor)
    return objetos
  }))
  return porPasta.flat()
}

export default {
  async fetch(request, env, ctx, opcoes = {}) {
    const url = new URL(request.url)
    const local = env.DEV_SEM_LOGIN === '1' && ['localhost', '127.0.0.1'].includes(url.hostname)
    const email = local ? 'dev@local' : await usuarioDoAccess(request, env, opcoes)
    if (!email) return resposta('Acesso negado. Entre pelo link dos backups com um e-mail autorizado.', 403)
    if (request.method !== 'GET' && request.method !== 'HEAD') return resposta('Método não permitido.', 405)

    if (url.pathname === '/') {
      const [objetos, downloads] = await Promise.all([listar(env.BACKUPS), downloadsRecentes(env.BACKUPS)])
      const html = paginaHtml({ grupos: agrupar(objetos), downloads, email, versao: VERSAO })
      return resposta(html, 200, { 'Content-Type': 'text/html; charset=utf-8' })
    }
    if (url.pathname.startsWith('/baixar/')) {
      const chave = url.pathname.slice('/baixar/'.length)
      if (!PADRAO.test(chave)) return resposta('Cópia não encontrada.', 404)
      const objeto = await env.BACKUPS.get(chave)
      if (!objeto) return resposta('Cópia não encontrada.', 404)
      const head = request.method === 'HEAD'
      if (!head) {
        console.log(JSON.stringify({ evento: 'download', email, chave }))
        ctx.waitUntil(env.BACKUPS.put(chaveRegistro(Date.now()), '', { customMetadata: { email, chave } }))
      }
      return new Response(head ? null : objeto.body, {
        headers: {
          ...SEGURANCA,
          'Content-Type': 'application/zip',
          'Content-Length': String(objeto.size),
          'Content-Disposition': `attachment; filename="${chave.split('/').pop()}"`,
        },
      })
    }
    return resposta('Página não encontrada.', 404)
  },
}
