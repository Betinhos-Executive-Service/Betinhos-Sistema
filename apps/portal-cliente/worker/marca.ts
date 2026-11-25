// Identidade do cliente (logo, cor e nome) para o login e o topo do portal. As rotas são públicas e devolvem só isso:
// cliente sem portal, sem módulo, sem identidade, domínio público ou ambíguo = 404 igual para todos (não revela nada).
import { chaveDaMarca, DOMINIOS_PUBLICOS_MARCA, ehCor, type Marca } from '../src/domain/marca'
import { dominioDe } from '../src/domain/pedidos'
import { ErroDataverse, type Dv } from './dataverse'
import { erro, json } from './http'
import { mapearModulos, type Registro } from './mapear'
import { clientesComPortal, ehGuid, logoDoCliente, marcaDoCliente, marcasPorDominio } from './odata'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const dominiosDe = (c: Registro) => String(c.cr40f_portaldominios ?? '').toLowerCase().split(/[\s,;]+/).filter(Boolean)
const aberto = (c: Registro) => c.cr40f_portalhabilitado === true && mapearModulos(c.cr40f_portalmodulos).length > 0

/** Marca do registro do cliente, ou `null` quando não há logo, cor nem nome de exibição cadastrados. */
export function marcaDe(c: Registro): Marca | null {
  const logo = c.cr40f_portallogo_timestamp
  const cor = ehCor(c.cr40f_portalcor) ? c.cr40f_portalcor.toLowerCase() : undefined
  const temLogo = Boolean(logo) && logo !== '0'
  const exibicao = String(c.cr40f_portalnomeexibicao ?? '').trim()
  if (!temLogo && !cor && !exibicao) return null
  const nome = exibicao || String(c.cr40f_nomedocliente ?? '').trim()
  return {
    nome,
    ...(cor ? { cor } : {}),
    ...(temLogo ? { logoUrl: `/api/marca/logo/${c.cr40f_clientes1id}?v=${encodeURIComponent(String(logo))}` } : {}),
  }
}

/** Marca do cliente da sessão. Falha de leitura (ex.: coluna ainda não publicada) = sem marca; o login não depende dela. */
export async function marcaDaSessao(dv: Dv, clienteId: string): Promise<Marca | null> {
  try {
    const c = await dv.get(marcaDoCliente(clienteId))
    return aberto(c) ? marcaDe(c) : null
  } catch {
    return null
  }
}

async function acharCliente(dv: Dv, chave: string, email: string): Promise<Registro | null> {
  if (chave) {
    const donos = (await dv.lista(clientesComPortal())).filter((c) => aberto(c) && chaveDaMarca(String(c.cr40f_nomedocliente ?? '')) === chave)
    return donos.length === 1 ? donos[0] : null
  }
  const dominio = dominioDe(email)
  if (!EMAIL.test(email) || !dominio || DOMINIOS_PUBLICOS_MARCA.includes(dominio)) return null
  const donos = (await dv.lista(marcasPorDominio(dominio))).filter((c) => aberto(c) && dominiosDe(c).includes(dominio))
  return donos.length === 1 ? donos[0] : null
}

/** `GET /api/marca?c=<chave>` (link do cliente) ou `?email=` (domínio do e-mail digitado). */
export async function consultarMarca(dv: Dv, url: URL): Promise<Response> {
  const chave = chaveDaMarca(url.searchParams.get('c') ?? '')
  const email = (url.searchParams.get('email') ?? '').trim().toLowerCase().slice(0, 254)
  try {
    const cliente = chave || email ? await acharCliente(dv, chave, email) : null
    const marca = cliente ? marcaDe(cliente) : null
    return marca ? json(marca, 200, { 'Cache-Control': 'private, max-age=60' }) : erro(404, 'nao_permitido')
  } catch (e) {
    console.error('marca', String(e))
    return erro(404, 'nao_permitido')
  }
}

type Formato = { tipo: string; confere: (b: Uint8Array) => boolean }
const ascii = (b: Uint8Array, de: number, texto: string) => [...texto].every((ch, i) => b[de + i] === ch.charCodeAt(0))
// Só PNG e JPEG: a coluna Image do Dataverse não guarda SVG nem WebP, e SVG servido neste domínio abriria risco de XSS.
const FORMATOS: Formato[] = [
  { tipo: 'image/png', confere: (b) => b[0] === 0x89 && ascii(b, 1, 'PNG') },
  { tipo: 'image/jpeg', confere: (b) => b[0] === 0xff && b[1] === 0xd8 },
]

/** `GET /api/marca/logo/<clienteId>`: imagem do Dataverse; só de cliente com portal, módulo e logo, com o tipo conferido pelo conteúdo. */
export async function baixarLogo(dv: Dv, clienteId: string): Promise<Response> {
  if (!ehGuid(clienteId)) return erro(404, 'nao_permitido')
  try {
    const cliente = await dv.get(marcaDoCliente(clienteId))
    if (!aberto(cliente) || !marcaDe(cliente)?.logoUrl) return erro(404, 'nao_permitido')
    const { bytes } = await dv.binario(logoDoCliente(clienteId))
    const formato = FORMATOS.find((f) => f.confere(bytes))
    if (!formato) return erro(404, 'nao_permitido')
    return new Response(bytes, {
      headers: { 'Content-Type': formato.tipo, 'Cache-Control': 'public, max-age=300', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'" },
    })
  } catch (e) {
    if (!(e instanceof ErroDataverse && e.status === 404)) console.error('logo', String(e))
    return erro(404, 'nao_permitido')
  }
}
