// Fotos dos veículos no SharePoint, pelos mesmos Flows HTTP usados na Tela Funcionários
// (site BetinhosGestoInterna, biblioteca "Documentos Compartilhados").
export const SP_VARS = {
  salvar: 'new_URLFlowsalvararquivosSharePoint',
  consultar: 'new_URLFlowConsultarArquivosSharePoint',
  listar: 'new_URLFlowListarArquivosSharePoint',
} as const
export type SpKey = keyof typeof SP_VARS

export const FOTO_MAX_BYTES = 10 * 1024 * 1024
const IMAGEM = /\.(png|jpe?g|webp)$/i

/** Pasta estável por veículo (id não muda quando a placa muda). DEV fica separado. */
export function pastaFotoVeiculo(id: string, envLabel: string) {
  return `Veiculos/${envLabel === 'DEV' ? 'DEV/' : ''}${id}/Foto`
}

/** "principal-20261005-153012.png" (São Paulo); nome único evita colisão no Flow Salvar. */
export function nomeFoto(file: File, agora = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(agora)
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '00'
  const ext = (file.name.match(IMAGEM)?.[0] ?? '.png').toLowerCase()
  return `principal-${get('year')}${get('month')}${get('day')}-${get('hour')}${get('minute')}${get('second')}${ext}`
}

export type ArquivoSp = { id: string; nome: string; caminho: string; modificadoEm: string; mimeType: string | null }

/** Foto principal = imagem modificada mais recentemente na pasta. */
export function escolherPrincipal(arquivos: ArquivoSp[]) {
  return arquivos.filter((item) => IMAGEM.test(item.nome)).sort((a, b) => b.modificadoEm.localeCompare(a.modificadoEm))[0] ?? null
}

export async function callSpFlow(url: string, body: unknown): Promise<Record<string, unknown>> {
  let response: Response
  try {
    response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  } catch {
    throw new Error('Não foi possível falar com o SharePoint (rede ou bloqueio do navegador)')
  }
  let result: Record<string, unknown> = {}
  try { result = await response.json() } catch { /* corpo vazio */ }
  if (!response.ok || result.sucesso !== true) throw new Error(String(result.erro || result.mensagem || `O SharePoint não respondeu (HTTP ${response.status})`))
  return result
}

export function toArquivo(item: Record<string, unknown>): ArquivoSp {
  return {
    id: String(item.id ?? item.identificador ?? ''),
    nome: String(item.nomeArquivo ?? ''),
    caminho: String(item.caminhoSharePoint ?? ''),
    modificadoEm: typeof item.modificadoEm === 'string' ? item.modificadoEm : '',
    mimeType: typeof item.mimeType === 'string' && item.mimeType ? item.mimeType : null,
  }
}

export function fileToBase64(file: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ''))
    reader.onerror = () => reject(new Error('Não foi possível ler o arquivo'))
    reader.readAsDataURL(file)
  })
}

export function base64ToBlob(base64: string, mime: string) {
  const bin = atob(base64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}
