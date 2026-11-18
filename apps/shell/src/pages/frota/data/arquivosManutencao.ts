// apps/shell/src/pages/frota/data/arquivosManutencao.ts
import type { OrigemArquivo } from './source'

/** "Flow Salvar Arquivos OneDrive", o mesmo das fotos da manutenção no App (data/dataverse/flow.ts). */
export const VAR_FLOW_ARQUIVOS = 'new_FlowURLFlowSalvarArquivosOnedrive'

/** Trecho de caminho sem os caracteres que o OneDrive recusa (mesma regra do App: sanitizePathSegment). */
export function segmentoPasta(valor: string | null | undefined, padrao: string) {
  const limpo = String(valor ?? '').trim().replace(/[<>:"/\\|?*\x00-\x1F]/g, '-').replace(/\s+/g, ' ').replace(/\.+$/g, '')
  return limpo || padrao
}

const prefixo = (envLabel: string) => (envLabel === 'DEV' ? 'DEV/' : '')

/** Mesma pasta do App (buildMaintenancePhotoFolder): Manutenções/[DEV/]<modelo - placa>/<código>. */
export function pastaManutencao(envLabel: string, modelo: string | null, placa: string | null, codigo: string) {
  const veiculo = `${(modelo ?? '').trim() || 'Sem modelo'} - ${(placa ?? '').trim() || 'Sem placa'}`
  return `Manutenções/${prefixo(envLabel)}${segmentoPasta(veiculo, 'Sem modelo - Sem placa')}/${segmentoPasta(codigo, 'Sem ID')}`
}

/** Mesma pasta do App (uploadExpenseInvoiceRemote): Despesas/[DEV/]<nome da despesa>. */
export const pastaDespesa = (envLabel: string, nome: string) => `Despesas/${prefixo(envLabel)}${segmentoPasta(nome, 'Sem nome')}`

const EXTENSOES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif', 'application/pdf': 'pdf' }

export function extensaoDe(arquivo: Pick<File, 'type' | 'name'>) {
  const porTipo = EXTENSOES[arquivo.type.toLowerCase()]
  if (porTipo) return porTipo
  return /\.([a-z0-9]+)$/i.exec(arquivo.name)?.[1]?.toLowerCase() || 'bin'
}

/** new_tipofoto igual ao do App: NOTAFISCAL, NOTAFISCAL_2…; FOTO1 a FOTO3. */
export const tipoFoto = (origem: OrigemArquivo, ordem: number) => (origem === 'NOTA_FISCAL' ? (ordem === 1 ? 'NOTAFISCAL' : `NOTAFISCAL_${ordem}`) : `FOTO${ordem}`)

const CHAVES_LINK = ['shareLink', 'link', 'webUrl', 'url', 'fileLink', 'sharedLink', 'href'] as const

/** Link de compartilhamento na resposta do Flow (mesmas chaves que o App aceita em requireFlowLink). */
export function linkDoFlow(resultado: unknown): string {
  if (typeof resultado === 'string') {
    try { return linkDoFlow(JSON.parse(resultado)) } catch { return '' }
  }
  if (!resultado || typeof resultado !== 'object') return ''
  const r = resultado as Record<string, unknown>
  for (const chave of CHAVES_LINK) {
    const valor = r[chave]
    if (typeof valor === 'string' && /^https?:\/\//i.test(valor.trim())) return valor.trim()
  }
  for (const chave of ['link', 'shareLink'] as const) {
    const valor = r[chave]
    if (valor && typeof valor === 'object') {
      const aninhado = linkDoFlow(valor)
      if (aninhado) return aninhado
    }
  }
  const corpo = r.body ?? r.Body ?? r.responseText
  return corpo ? linkDoFlow(corpo) : ''
}

/** O Flow responde 200 mesmo em falha, com status/resultado no corpo (como o assertFlowSuccess do App). */
export function exigirSucessoDoFlow(resultado: unknown) {
  if (!resultado || typeof resultado !== 'object') return
  const r = resultado as Record<string, unknown>
  const status = String(r.status ?? r.Status ?? r.resultado ?? r.Resultado ?? '').trim()
  if (!status) return
  const normal = status.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  if (normal === 'sucesso' || normal === 'success' || normal === 'ok') return
  const mensagem = [r.message, r.mensagem, r.error, r.erro].map(textoDeErro).find(Boolean)
  throw new Error(mensagem ?? `O Flow de arquivos respondeu ${status}`)
}

/** Mensagem de um erro do flow: texto, ou o `message`/`mensagem` de um objeto (nunca "[object Object]"). */
function textoDeErro(valor: unknown): string | undefined {
  if (typeof valor === 'string') return valor.trim() || undefined
  if (valor && typeof valor === 'object') {
    const o = valor as Record<string, unknown>
    return textoDeErro(o.message) ?? textoDeErro(o.mensagem)
  }
  return undefined
}

// ---------- Formatos aceitos (a mesma lista vale para o `accept` do Upload e para a camada de dados) ----------

const TIPOS_FOTO = ['image/png', 'image/jpeg', 'image/webp'] as const
const TIPOS_NOTA = [...TIPOS_FOTO, 'application/pdf'] as const
const EXT_FOTO = ['.png', '.jpg', '.jpeg', '.webp'] as const
const EXT_NOTA = [...EXT_FOTO, '.pdf'] as const

/** Valor do `accept` do Upload: foto = PNG, JPEG e WEBP; nota = os mesmos e PDF. */
export const ACCEPT_FOTO = [...TIPOS_FOTO, ...EXT_FOTO].join(',')
export const ACCEPT_NOTA = [...TIPOS_NOTA, ...EXT_NOTA].join(',')

export type TipoArquivo = 'foto' | 'nota'

/** Recusa o arquivo de formato fora da lista: pelo tipo declarado e, sem tipo, pela extensão do nome. */
export function exigirFormato(arquivo: Pick<File, 'name' | 'type'>, tipo: TipoArquivo) {
  const tipos: readonly string[] = tipo === 'nota' ? TIPOS_NOTA : TIPOS_FOTO
  const extensoes: readonly string[] = tipo === 'nota' ? EXT_NOTA : EXT_FOTO
  const declarado = arquivo.type.trim().toLowerCase().replace('image/jpg', 'image/jpeg')
  const extensao = /\.[a-z0-9]+$/i.exec(arquivo.name)?.[0].toLowerCase() ?? ''
  const aceito = declarado ? tipos.includes(declarado) : extensoes.includes(extensao)
  if (!aceito) throw new Error(`${arquivo.name}: formato não aceito (${tipo === 'nota' ? 'use JPG, PNG, WEBP ou PDF' : 'use JPG, PNG ou WEBP'})`)
}

/** Data e hora de São Paulo (UTC−3, sem horário de verão) como `YYYYMMDD-HHmmss`. */
export function carimboDeEnvio(agora: Date) {
  return new Date(agora.getTime() - 3 * 3_600_000).toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-')
}

/** Nome do arquivo no OneDrive: `<base>-<data e hora>.<extensão>`. O carimbo evita que o reenvio, depois de uma falha, colida com o arquivo anterior. */
export const nomeArquivoEnvio = (base: string, extensao: string, agora: Date) => `${base}-${carimboDeEnvio(agora)}.${extensao}`
