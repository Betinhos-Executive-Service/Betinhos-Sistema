import { COMUNICADO_TIPO, fileSlug, formatDate, isDisparado, isPendente, type Comunicado, type Destinatario } from './comunicados'

/** Um comprovante: o motorista que concluiu × o comunicado. */
export type Par = { comunicado: Comunicado; destinatario: Destinatario; motorista: string }
export type ModoPdf = 'comunicado' | 'motorista'

/** Concluído = Ciência com `cienteEm`, Informativo com `lidoEm`; pendente não vira comprovante. */
export const concluido = (par: Pick<Par, 'comunicado' | 'destinatario'>) => !isPendente(par.destinatario, par.comunicado.tipo)

/** Sem seleção, vale todo o conjunto de concluídos; com seleção, só os concluídos marcados (ids de destinatário). */
const aplicarSelecao = (pares: Par[], selecionados: ReadonlySet<string>) => {
  const feitos = pares.filter(concluido)
  const marcados = feitos.filter((par) => selecionados.has(par.destinatario.id))
  return marcados.length ? marcados : feitos
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
