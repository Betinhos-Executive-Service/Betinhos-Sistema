import type { ModuloPortal, PortalConfig } from './types'

/** Valores da choice múltipla `cr40f_portalmodulos` (mesmos de `apps/portal-cliente/worker/schema.ts`). */
export const MODULO_VALOR: Record<ModuloPortal, number> = { validar: 100000000, pedir: 100000001, meus_servicos: 100000002 }
export const MODULOS: { value: ModuloPortal; label: string; description: string }[] = [
  { value: 'validar', label: 'Validar', description: 'Aprovar ou questionar os serviços liberados pelo financeiro.' },
  { value: 'pedir', label: 'Pedir', description: 'Solicitar novos serviços pelo portal.' },
  { value: 'meus_servicos', label: 'Meus serviços', description: 'Acompanhar os serviços já pedidos.' },
]
export const MODULO_LABEL = Object.fromEntries(MODULOS.map((m) => [m.value, m.label])) as Record<ModuloPortal, string>

/** Domínios de e-mail abertos ao público: liberar um deles deixa qualquer pessoa pedir cadastro. */
export const DOMINIOS_PUBLICOS = ['gmail.com', 'hotmail.com', 'outlook.com', 'yahoo.com', 'yahoo.com.br', 'icloud.com', 'live.com', 'uol.com.br', 'bol.com.br', 'terra.com.br']

/** Lê a choice múltipla como a Web API devolve (`'100000001,100000002'`). */
export function lerModulos(valor: unknown): ModuloPortal[] {
  if (typeof valor !== 'string') return []
  const numeros = new Set(valor.split(',').map((v) => Number(v.trim())))
  return MODULOS.filter((m) => numeros.has(MODULO_VALOR[m.value])).map((m) => m.value)
}

export const gravarModulos = (modulos: ModuloPortal[]): string | null =>
  modulos.length ? MODULOS.filter((m) => modulos.includes(m.value)).map((m) => String(MODULO_VALOR[m.value])).join(',') : null

/** Domínio limpo: minúsculas, sem `@`, protocolo, `www.` nem caminho; sem ponto não é domínio. */
export function normalizarDominio(texto: string): string | null {
  const limpo = texto.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^@+/, '').replace(/^www\./, '').split(/[/?#]/)[0]
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(limpo) ? limpo : null
}

/** Separa por `;`, vírgula, espaço ou quebra de linha; devolve os válidos sem repetição e o que foi rejeitado. */
export function normalizarDominios(texto: string): { dominios: string[]; invalidos: string[] } {
  const dominios: string[] = []
  const invalidos: string[] = []
  for (const parte of texto.split(/[;,\s]+/).filter(Boolean)) {
    const d = normalizarDominio(parte)
    if (!d) invalidos.push(parte)
    else if (!dominios.includes(d)) dominios.push(d)
  }
  return { dominios, invalidos }
}

/** Logo: tipos aceitos e limite da coluna `cr40f_portallogo` (1 MB). */
const LOGO_TIPOS = ['image/png', 'image/jpeg']
export const LOGO_MAX_BYTES = 1024 * 1024
export const NOME_EXIBICAO_MAX = 100

/** Motivo da recusa do arquivo de logo, ou `null` quando serve. */
export function validarLogo(arquivo: { type: string; size: number }): string | null {
  if (!LOGO_TIPOS.includes(arquivo.type)) return 'Formato não aceito. Envie PNG ou JPG.'
  if (arquivo.size > LOGO_MAX_BYTES) return `Arquivo com ${(arquivo.size / 1024 / 1024).toFixed(1).replace('.', ',')} MB. O limite é 1 MB.`
  return null
}

const HEX = /^#[0-9a-f]{6}$/i
export const ehCor = (v: string) => HEX.test(v)

const canal = (v: number) => {
  const s = v / 255
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}
/** Contraste WCAG da cor com branco (1 a 21); mesma conta do portal (`apps/portal-cliente/src/domain/marca.ts`). */
export function contrasteComBranco(cor: string): number {
  const n = parseInt(cor.slice(1), 16)
  return 1.05 / (0.2126 * canal((n >> 16) & 255) + 0.7152 * canal((n >> 8) & 255) + 0.0722 * canal(n & 255) + 0.05)
}
const CONTRASTE_MINIMO = 4.5
/** Cor que o portal realmente usa: a do cliente só se o branco por cima for legível. */
export const corLegivel = (cor: string): string | undefined => (ehCor(cor) && contrasteComBranco(cor) >= CONTRASTE_MINIMO ? cor.toLowerCase() : undefined)

export type ConfigForm = {
  ligado: boolean; modulos: ModuloPortal[]; restringir: boolean; dominiosTexto: string
  nomeExibicao: string; cor: string
  /** Logo escolhido, como data URL; `null` = sem logo. Só vai ao Dataverse quando `logoMudou`. */
  logo: string | null; logoMudou: boolean
}
export type ConfigErros = Partial<Record<'modulos' | 'dominios' | 'cor' | 'nomeExibicao', string>>

export const formDaConfig = (c: PortalConfig, logo: string | null = null): ConfigForm => ({
  ligado: c.ligado, modulos: c.modulos, restringir: c.dominios.length > 0, dominiosTexto: c.dominios.join('; '),
  nomeExibicao: c.nomeExibicao, cor: c.cor, logo, logoMudou: false,
})

/** Domínios que vão para o Dataverse: "só cadastrados" não leva nenhum. */
export const dominiosDoForm = (f: ConfigForm): string[] => (f.restringir ? normalizarDominios(f.dominiosTexto).dominios : [])

/** Erros que impedem salvar e avisos que não impedem (domínio público). `outros` são as configurações dos demais clientes. */
export function validarConfig(f: ConfigForm, clienteId: string, outros: PortalConfig[]): { erros: ConfigErros; avisos: string[] } {
  const erros: ConfigErros = {}
  const avisos: string[] = []
  const cor = f.cor.trim()
  if (cor && !ehCor(cor)) erros.cor = 'Cor inválida. Use o formato #RRGGBB, por exemplo #0a7d4a.'
  else if (cor && !corLegivel(cor)) avisos.push(`A cor ${cor} tem pouco contraste com o branco (${contrasteComBranco(cor).toFixed(1).replace('.', ',')}:1; o mínimo é 4,5:1). O portal vai usar a cor padrão da Betinhos.`)
  if (f.nomeExibicao.trim().length > NOME_EXIBICAO_MAX) erros.nomeExibicao = `Use no máximo ${NOME_EXIBICAO_MAX} caracteres.`
  if (f.ligado && !f.modulos.length) erros.modulos = 'Escolha ao menos um módulo; sem módulo ninguém entra.'
  if (f.restringir) {
    const { dominios, invalidos } = normalizarDominios(f.dominiosTexto)
    if (invalidos.length) erros.dominios = `Domínio inválido: ${invalidos.join(', ')}. Use o formato empresa.com.br.`
    else if (!dominios.length) erros.dominios = 'Informe ao menos um domínio ou escolha "Só e-mails cadastrados".'
    else {
      // Só conflita quem está ligado: com o portal desligado o domínio não resolve cliente nenhum.
      const repetido = f.ligado ? dominios.flatMap((d) => {
        const dono = outros.find((o) => o.ligado && o.cliente.id !== clienteId && o.dominios.includes(d))
        return dono ? [`@${d} já é do cliente ${dono.cliente.nome}`] : []
      }) : []
      if (repetido.length) erros.dominios = `${repetido.join('; ')}.`
      for (const d of dominios) if (DOMINIOS_PUBLICOS.includes(d)) avisos.push(`@${d} é um e-mail público: qualquer pessoa com conta nele poderá se cadastrar sozinha neste cliente.`)
    }
  }
  return { erros, avisos }
}

export const quemEntra = (dominios: string[]) => (dominios.length ? `Cadastrados + ${dominios.map((d) => `@${d}`).join(', ')}` : 'Só cadastrados')

export const configIgual = (a: ConfigForm, b: ConfigForm) =>
  a.ligado === b.ligado && a.restringir === b.restringir && a.dominiosTexto.trim() === b.dominiosTexto.trim()
  && a.nomeExibicao.trim() === b.nomeExibicao.trim() && a.cor.trim().toLowerCase() === b.cor.trim().toLowerCase() && a.logo === b.logo
  && MODULOS.every((m) => a.modulos.includes(m.value) === b.modulos.includes(m.value))
