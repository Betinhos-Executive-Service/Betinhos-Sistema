import { COMUNICADO_TIPO, fileSlug, formatDate, isDisparado, isPendente, type Comunicado, type Destinatario, type Evidencia } from './comunicados'

/** Um comprovante: o motorista que concluiu × o comunicado. */
export type Par = { comunicado: Comunicado; destinatario: Destinatario; motorista: string }
export type ModoPdf = 'comunicado' | 'motorista'

/** Concluído = Ciência com `cienteEm`, Informativo com `lidoEm`; pendente não vira comprovante. */
export const concluido = (par: Pick<Par, 'comunicado' | 'destinatario'>) => !isPendente(par.destinatario, par.comunicado.tipo)

/** Sem seleção, vale todo o conjunto de concluídos; com seleção, só os concluídos marcados (ids de destinatário). Seleção que não casa com nenhum concluído gera vazio. */
const aplicarSelecao = (pares: Par[], selecionados: ReadonlySet<string>) => {
  const feitos = pares.filter(concluido)
  return selecionados.size ? feitos.filter((par) => selecionados.has(par.destinatario.id)) : feitos
}

export function paresDoComunicado(comunicado: Comunicado, rows: Destinatario[], nome: (row: Destinatario) => string, selecionados: ReadonlySet<string>): Par[] {
  return aplicarSelecao(rows.map((destinatario) => ({ comunicado, destinatario, motorista: nome(destinatario) })), selecionados)
}

/** Só comunicados disparados entram; `rows` são os destinatários do motorista. */
export function paresDoMotorista(motorista: string, comunicados: Comunicado[], rows: Destinatario[], selecionados: ReadonlySet<string>): Par[] {
  const porId = new Map(comunicados.filter(isDisparado).map((item) => [item.id, item]))
  const pares: Par[] = []
  for (const destinatario of rows) {
    const comunicado = porId.get(destinatario.comunicadoId)
    if (comunicado) pares.push({ comunicado, destinatario, motorista })
  }
  return aplicarSelecao(pares, selecionados)
}

/** Identificador do conteúdo disparado: SHA-256 hex de `titulo + "\n" + corpo`. Não prova integridade nem autoria. */
export async function hashConteudo(titulo: string, corpo: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${titulo}\n${corpo}`))
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function nomeArquivo(modo: ModoPdf, alvo: string, pares: Par[]) {
  if (pares.length === 1) return `comprovante-${fileSlug(pares[0].comunicado.titulo)}-${fileSlug(pares[0].motorista)}.pdf`
  return modo === 'comunicado' ? `comunicado-${fileSlug(alvo)}-${pares.length}-comprovantes.pdf` : `comunicados-${fileSlug(alvo)}-${pares.length}.pdf`
}

/** Linha de apoio de um comunicado concluído nas listas de seleção. */
export const descricaoConclusao = ({ comunicado, destinatario }: Pick<Par, 'comunicado' | 'destinatario'>) =>
  `${comunicado.tipo === COMUNICADO_TIPO.ciencia ? 'Ciência assinada' : 'Leitura confirmada'} em ${formatDate(destinatario.cienteEm || destinatario.lidoEm)}`

export const tituloComprovante = (tipo: number) => (tipo === COMUNICADO_TIPO.ciencia ? 'Comprovante de ciência' : 'Comprovante de leitura')

type Linha = [rotulo: string, valor: string]
const USER_AGENT_MAX = 50
const GEO_ROTULO: Record<string, string> = { negada: 'não autorizada', indisponivel: 'indisponível', 'tempo-esgotado': 'tempo esgotado' }

/** Linhas "rótulo: valor" da seção "Aparelho e local" de um momento (abertura, leitura ou ciência). */
export function linhasEvidencia(evidencia: Evidencia | null): Linha[] {
  if (!evidencia) return [['', 'Não registrado (registro anterior à captura do aparelho).']]
  if (evidencia.invalida) return [['', 'Registro do aparelho ilegível (formato inválido).']]
  const aparelho = [evidencia.platform, evidencia.model].filter(Boolean).join(' ')
  const agente = evidencia.userAgent.length > USER_AGENT_MAX ? `${evidencia.userAgent.slice(0, USER_AGENT_MAX)}...` : evidencia.userAgent
  const geo = evidencia.geo
  const mapa = geo?.status === 'ok' && geo.lat != null && geo.lon != null
  const linhas: Linha[] = [
    ['Aparelho', [aparelho, agente].filter(Boolean).join(' · ')],
    ['Versão do App', evidencia.appVersion],
    ['Endereço de internet (IP)', evidencia.ip ? `${evidencia.ip} (${evidencia.ipVerificado ? 'verificado' : 'não verificado'})` : 'não registrado'],
  ]
  if (!geo) linhas.push(['Localização', 'não registrada'])
  else if (mapa) {
    const [lat, lon] = [geo.lat!.toFixed(5), geo.lon!.toFixed(5)]
    linhas.push(['Localização', `${lat}, ${lon}${geo.accuracy != null ? ` (±${Math.round(geo.accuracy)} m)` : ''}`], ['Mapa', `https://www.google.com/maps?q=${lat},${lon}`])
  } else linhas.push(['Localização', GEO_ROTULO[geo.status] ?? 'indisponível'])
  return linhas
}
