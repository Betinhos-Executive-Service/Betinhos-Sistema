import { cleanId, type Row } from '@betinhos/dataverse'
import { plural } from '../../comunicados/domain/comunicados'
import { FUNCAO } from '../../funcionarios/data/schema'

export { formatDate, plural } from '../../comunicados/domain/comunicados'
/** `AAAA-MM-DD` → `dd/mm/aaaa` sem passar por Date. */
export { fmtData as fmtDia } from '../../equipamentos/components/EquipamentosList'

export const erroTexto = (reason: unknown, fallback = 'Algo deu errado.') => (reason instanceof Error && reason.message ? reason.message : fallback)

// Treinamentos do RH para os motoristas: regras da tela de gestão. O consumo (leitura, assinatura e quiz) é do App Motoristas.

export const PUBLICO = { motoristas: 100000000, funcao: 100000001, selecionados: 100000002 } as const
export const ESTADO = { rascunho: 100000000, publicado: 100000001 } as const
export type PublicoTipo = (typeof PUBLICO)[keyof typeof PUBLICO]

export const FUNCAO_MOTORISTA = 202410000

export type Alternativa = { id: string; texto: string }
export type Pergunta = { id: string; texto: string; alternativas: Alternativa[]; corretaId: string }
export type Anexo = { nome: string; caminho: string; tamanho: number; mime: string }

export type Treinamento = {
  id: string
  titulo: string
  descricao: string
  /** Texto com marcação simples (parágrafos, `**negrito**`, `- item`, `# título`). */
  conteudo: string
  videoUrl: string
  anexos: Anexo[]
  publicoTipo: PublicoTipo
  /** Valores de `cr40f_funcao` (por função) ou ids de funcionários (selecionados). */
  publico: string[]
  exigeAssinatura: boolean
  exigeQuiz: boolean
  /** Percentual de acerto para aprovar (0–100). */
  notaMinima: number
  perguntas: Pergunta[]
  /** Prazo para concluir (`AAAA-MM-DD`) ou vazio. */
  validade: string
  estado: number
  publicadoEm: string | null
  /** Última edição de conteúdo ou validade depois de publicado. */
  editadoEm: string | null
}

export type Participacao = {
  id: string
  treinamentoId: string
  funcionarioId: string
  abertoEm: string | null
  confirmadoEm: string | null
  assinadoEm: string | null
  nomeAssinante: string
  assinaturaJson: string
  nota: number | null
  aprovado: boolean | null
  tentativas: number
  concluidoEm: string | null
  pushStatus: number | null
  pushErro: string
  lembradoEm: string | null
  conteudoSnapshot: string
  conteudoHash: string
}

export type Funcionario = { id: string; nome: string; apelido: string; funcao: number | null; ativo: boolean }

export const TITULO_MAX = 200
export const DESCRICAO_MAX = 300
export const CONTEUDO_MAX = 20000
export const VIDEO_MAX = 500
export const ANEXO_MAX_BYTES = 25 * 1024 * 1024
// Vídeo vai pelo Flow de upload em base64 (+33%): 50 MB ficam abaixo do limite de 100 MB do gatilho HTTP.
export const ANEXO_VIDEO_MAX_BYTES = 50 * 1024 * 1024
export const ANEXO_VIDEO_TIPOS = ['video/mp4', 'video/quicktime', 'video/webm']
export const ANEXO_TIPOS = [...ANEXO_VIDEO_TIPOS, 'application/pdf', 'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation']
export const NOTA_PADRAO = 70

let seq = 0
export const novoId = () => `${Date.now().toString(36)}${(seq += 1).toString(36)}`
export const novaAlternativa = (): Alternativa => ({ id: novoId(), texto: '' })
export const novaPergunta = (): Pergunta => ({ id: novoId(), texto: '', alternativas: [novaAlternativa(), novaAlternativa()], corretaId: '' })

export const emptyDraft = (): Treinamento => ({
  id: '', titulo: '', descricao: '', conteudo: '', videoUrl: '', anexos: [], publicoTipo: PUBLICO.motoristas, publico: [],
  exigeAssinatura: false, exigeQuiz: false, notaMinima: NOTA_PADRAO, perguntas: [], validade: '', estado: ESTADO.rascunho, publicadoEm: null, editadoEm: null,
})

export const isPublicado = (item: Treinamento) => item.estado === ESTADO.publicado
export const isVideoValido = (url: string) => { try { return new URL(url).protocol === 'https:' } catch { return false } }
export const isImagem = (anexo: Anexo) => anexo.mime.startsWith('image/')
export const isVideo = (anexo: Anexo) => anexo.mime.startsWith('video/')

export function validarAnexo(file: File) {
  if (!ANEXO_TIPOS.includes(file.type)) return 'Use PDF, imagem (PNG, JPG, GIF, WEBP), vídeo (MP4, MOV, WEBM), Word ou PowerPoint.'
  if (file.size === 0) return 'O arquivo está vazio.'
  if (ANEXO_VIDEO_TIPOS.includes(file.type)) return file.size > ANEXO_VIDEO_MAX_BYTES ? 'O vídeo deve ter até 50 MB.' : null
  if (file.size > ANEXO_MAX_BYTES) return 'O arquivo deve ter até 25 MB.'
  return null
}

/** Erro do quiz como o RH precisa corrigir; vazio quando está completo. */
export function validarQuiz(perguntas: Pergunta[]) {
  if (!perguntas.length) return 'Adicione pelo menos uma pergunta ao quiz.'
  for (const [i, p] of perguntas.entries()) {
    const n = i + 1
    if (!p.texto.trim()) return `Escreva o enunciado da pergunta ${n}.`
    const validas = p.alternativas.filter((a) => a.texto.trim())
    if (validas.length < 2) return `A pergunta ${n} precisa de pelo menos duas alternativas preenchidas.`
    if (!validas.some((a) => a.id === p.corretaId)) return `Marque a alternativa correta da pergunta ${n}.`
  }
  return ''
}

/** Funcionários que recebem o treinamento; desligados e inativos nunca entram. */
export function resolverPublico(item: Pick<Treinamento, 'publicoTipo' | 'publico'>, funcionarios: Funcionario[]) {
  const ativos = funcionarios.filter((f) => f.ativo)
  if (item.publicoTipo === PUBLICO.motoristas) return ativos.filter((f) => f.funcao === FUNCAO_MOTORISTA)
  if (item.publicoTipo === PUBLICO.funcao) return ativos.filter((f) => f.funcao != null && item.publico.includes(String(f.funcao)))
  const ids = new Set(item.publico.map(cleanId))
  return ativos.filter((f) => ids.has(cleanId(f.id)))
}

export function validarRascunho(draft: Treinamento) {
  if (!draft.titulo.trim() || draft.titulo.trim().length > TITULO_MAX) return `Informe um título de até ${TITULO_MAX} caracteres.`
  if (draft.descricao.length > DESCRICAO_MAX) return `A descrição tem no máximo ${DESCRICAO_MAX} caracteres.`
  if (draft.conteudo.length > CONTEUDO_MAX) return `O conteúdo tem no máximo ${CONTEUDO_MAX.toLocaleString('pt-BR')} caracteres.`
  const video = draft.videoUrl.trim()
  if (video && (!isVideoValido(video) || video.length > VIDEO_MAX)) return 'O vídeo precisa de um link https:// válido.'
  if (draft.exigeQuiz && (!Number.isInteger(draft.notaMinima) || draft.notaMinima < 0 || draft.notaMinima > 100)) return 'A nota mínima vai de 0 a 100.'
  if (draft.exigeQuiz) { const quiz = validarQuiz(draft.perguntas); if (quiz) return quiz }
  if (draft.validade && !/^\d{4}-\d{2}-\d{2}$/.test(draft.validade)) return 'Informe a validade como data.'
  return ''
}

/** Rascunho válido com conteúdo: vale para publicar e para editar o já publicado. */
export function validarComConteudo(draft: Treinamento) {
  const base = validarRascunho(draft)
  if (base) return base
  if (!draft.conteudo.trim() && !draft.videoUrl.trim() && !draft.anexos.length) return 'Inclua um texto, um vídeo ou um anexo.'
  return ''
}

/** O que falta para publicar, além do rascunho válido. */
export function validarPublicacao(draft: Treinamento, funcionarios: Funcionario[]) {
  const base = validarComConteudo(draft)
  if (base) return base
  if (draft.publicoTipo !== PUBLICO.motoristas && !draft.publico.length) return draft.publicoTipo === PUBLICO.funcao ? 'Escolha pelo menos uma função.' : 'Selecione pelo menos um funcionário.'
  if (!resolverPublico(draft, funcionarios).length) return 'Nenhum funcionário ativo no público-alvo. O treinamento não foi publicado.'
  return ''
}

const perguntasLimpas = (perguntas: Pergunta[]): Pergunta[] =>
  perguntas.map((p) => ({ ...p, texto: p.texto.trim(), alternativas: p.alternativas.filter((a) => a.texto.trim()).map((a) => ({ ...a, texto: a.texto.trim() })) }))

export function draftPayload(draft: Treinamento): Row {
  return {
    cr40f_name: draft.titulo.trim(),
    cr40f_descricao: draft.descricao.trim(),
    cr40f_conteudo: draft.conteudo.trim(),
    cr40f_videourl: draft.videoUrl.trim(),
    cr40f_anexosjson: JSON.stringify(draft.anexos),
    cr40f_publicotipo: draft.publicoTipo,
    cr40f_publicojson: JSON.stringify(draft.publicoTipo === PUBLICO.motoristas ? [] : draft.publico),
    cr40f_exigeassinatura: draft.exigeAssinatura,
    cr40f_exigequiz: draft.exigeQuiz,
    cr40f_notaminima: draft.exigeQuiz ? draft.notaMinima : null,
    cr40f_quizjson: JSON.stringify({ perguntas: draft.exigeQuiz ? perguntasLimpas(draft.perguntas) : [] }),
    cr40f_validade: draft.validade || null,
    cr40f_estado: ESTADO.rascunho,
  }
}

/** Edição depois de publicado: conteúdo, anexos e validade. Quiz, assinatura e público ficam como foram publicados. */
export function edicaoPublicadoPayload(item: Treinamento, agora = new Date().toISOString()): Row {
  return {
    cr40f_name: item.titulo.trim(),
    cr40f_descricao: item.descricao.trim(),
    cr40f_conteudo: item.conteudo.trim(),
    cr40f_videourl: item.videoUrl.trim(),
    cr40f_anexosjson: JSON.stringify(item.anexos),
    cr40f_validade: item.validade || null,
    cr40f_editadoem: agora,
  }
}

const SUFIXO_RECICLAGEM = /\s*\(reciclagem \d{2}\/\d{2}\/\d{4}\)\s*$/

/** Reaplicar: rascunho novo com o mesmo conteúdo, quiz e público; o RH revisa a validade e publica. */
export function copiaParaReciclagem(item: Treinamento, hoje: string): Treinamento {
  const [a, m, d] = hoje.split('-')
  const sufixo = ` (reciclagem ${d}/${m}/${a})`
  const base = item.titulo.replace(SUFIXO_RECICLAGEM, '').trim().slice(0, TITULO_MAX - sufixo.length)
  return {
    ...item, id: '', titulo: `${base}${sufixo}`, validade: '', estado: ESTADO.rascunho, publicadoEm: null, editadoEm: null,
    anexos: [...item.anexos], perguntas: item.perguntas.map((p) => ({ ...p, alternativas: p.alternativas.map((x) => ({ ...x })) })),
  }
}

/** Arquivo gravado na pasta deste treinamento. A cópia de reciclagem aponta para a pasta do original, que não pode ser apagada por ela. */
export const anexoDaPasta = (anexo: Anexo, treinamentoId: string) =>
  anexo.caminho.toLowerCase().includes(`/${cleanId(treinamentoId).toLowerCase()}/`)

function parseJson<T>(value: unknown, fallback: T): T {
  try { return JSON.parse(String(value || '')) as T } catch { return fallback }
}

export function parsePerguntas(value: unknown): Pergunta[] {
  const raw = parseJson<{ perguntas?: unknown }>(value, {})
  if (!Array.isArray(raw.perguntas)) return []
  return raw.perguntas.flatMap((p: Partial<Pergunta>) => {
    if (!p || typeof p.texto !== 'string' || !Array.isArray(p.alternativas)) return []
    const alternativas = p.alternativas.flatMap((a: Partial<Alternativa>) => (a && typeof a.texto === 'string' ? [{ id: String(a.id || novoId()), texto: a.texto }] : []))
    return [{ id: String(p.id || novoId()), texto: p.texto, alternativas, corretaId: String(p.corretaId || '') }]
  })
}

export function parseAnexos(value: unknown): Anexo[] {
  const raw = parseJson<unknown>(value, [])
  if (!Array.isArray(raw)) return []
  return raw.flatMap((a: Partial<Anexo>) => (a && typeof a.nome === 'string' && typeof a.caminho === 'string' ? [{ nome: a.nome, caminho: a.caminho, tamanho: Number(a.tamanho) || 0, mime: String(a.mime || '') }] : []))
}

const dateOrNull = (v: unknown) => (v ? String(v) : null)

export function mapTreinamento(row: Row): Treinamento {
  const publicoTipo = Number(row.cr40f_publicotipo ?? PUBLICO.motoristas) as PublicoTipo
  const publico = parseJson<unknown>(row.cr40f_publicojson, [])
  return {
    id: cleanId(String(row.cr40f_treinamentoid ?? '')),
    titulo: String(row.cr40f_name ?? ''),
    descricao: String(row.cr40f_descricao ?? ''),
    conteudo: String(row.cr40f_conteudo ?? ''),
    videoUrl: String(row.cr40f_videourl ?? ''),
    anexos: parseAnexos(row.cr40f_anexosjson),
    publicoTipo,
    publico: Array.isArray(publico) ? publico.map(String) : [],
    exigeAssinatura: Boolean(row.cr40f_exigeassinatura),
    exigeQuiz: Boolean(row.cr40f_exigequiz),
    notaMinima: typeof row.cr40f_notaminima === 'number' ? row.cr40f_notaminima : NOTA_PADRAO,
    perguntas: parsePerguntas(row.cr40f_quizjson),
    validade: String(row.cr40f_validade ?? '').slice(0, 10),
    estado: Number(row.cr40f_estado ?? ESTADO.rascunho),
    publicadoEm: dateOrNull(row.cr40f_publicadoem),
    editadoEm: dateOrNull(row.cr40f_editadoem),
  }
}

export function mapParticipacao(row: Row): Participacao {
  return {
    id: cleanId(String(row.cr40f_treinamentoparticipacaoid ?? '')),
    treinamentoId: cleanId(String(row._cr40f_treinamento_value ?? '')),
    funcionarioId: cleanId(String(row._cr40f_funcionario_value ?? '')),
    abertoEm: dateOrNull(row.cr40f_abertoem),
    confirmadoEm: dateOrNull(row.cr40f_confirmadoem),
    assinadoEm: dateOrNull(row.cr40f_assinadoem),
    nomeAssinante: String(row.cr40f_nomeassinante ?? ''),
    assinaturaJson: String(row.cr40f_assinaturajson ?? ''),
    nota: typeof row.cr40f_nota === 'number' ? row.cr40f_nota : null,
    aprovado: typeof row.cr40f_aprovado === 'boolean' ? row.cr40f_aprovado : null,
    tentativas: Number(row.cr40f_tentativas ?? 0),
    concluidoEm: dateOrNull(row.cr40f_concluidoem),
    pushStatus: typeof row.cr40f_pushstatus === 'number' ? row.cr40f_pushstatus : null,
    pushErro: String(row.cr40f_pusherro ?? ''),
    lembradoEm: dateOrNull(row.cr40f_lembradoem),
    conteudoSnapshot: String(row.cr40f_conteudosnapshot ?? ''),
    conteudoHash: String(row.cr40f_conteudohash ?? ''),
  }
}

export function mapFuncionario(row: Row): Funcionario {
  return {
    id: cleanId(String(row.cr40f_funcionariosid ?? '')),
    nome: String(row.cr40f_nomecompleto ?? ''),
    apelido: String(row.new_apelido ?? ''),
    funcao: typeof row.cr40f_funcao === 'number' ? row.cr40f_funcao : null,
    // 1 = Desligado; Afastado (2) continua recebendo o conteúdo.
    ativo: Number(row.cr40f_status) !== 1,
  }
}

export type StatusParticipacao = { label: string; tone: 'success' | 'info' | 'neutral' | 'danger' | 'warning'; quando: string | null }

/** Etapa mais avançada que o motorista alcançou e quando (null = ainda não abriu). */
export function statusParticipacao(p: Participacao): StatusParticipacao {
  if (p.concluidoEm) return { label: 'Concluído', tone: 'success', quando: p.concluidoEm }
  if (p.nota != null) return { label: `${p.aprovado ? 'Aprovado' : 'Reprovado'} · ${p.nota}%`, tone: p.aprovado ? 'success' : 'danger', quando: p.assinadoEm || p.confirmadoEm || p.abertoEm }
  if (p.assinadoEm) return { label: 'Assinado', tone: 'info', quando: p.assinadoEm }
  if (p.confirmadoEm) return { label: 'Confirmado', tone: 'info', quando: p.confirmadoEm }
  if (p.abertoEm) return { label: 'Aberto', tone: 'warning', quando: p.abertoEm }
  return { label: 'Não aberto', tone: 'neutral', quando: null }
}

const juntar = (nomes: string[], total: number) => {
  const resto = total - nomes.length
  if (resto > 0) return `${nomes.join(', ')} e mais ${resto}`
  return nomes.length > 1 ? `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}` : nomes[0] ?? ''
}

/** Público em texto: nomeia funções e até 2 pessoas; sem o cadastro à mão, cai na contagem. */
export function publicoLabel(item: Pick<Treinamento, 'publicoTipo' | 'publico'>, funcionarios: Funcionario[] = []) {
  if (item.publicoTipo === PUBLICO.motoristas) return 'Todos os motoristas'
  if (item.publicoTipo === PUBLICO.funcao) {
    const nomes = item.publico.map((v) => FUNCAO.find((f) => String(f.value) === v)?.label).filter((x): x is string => Boolean(x))
    return nomes.length === item.publico.length && nomes.length ? juntar(nomes.slice(0, 2), nomes.length) : `${item.publico.length} ${plural(item.publico.length, 'função', 'funções')}`
  }
  const nomes = item.publico.map((id) => funcionarios.find((f) => f.id === id)?.nome).filter((x): x is string => Boolean(x))
  return nomes.length === item.publico.length && nomes.length ? juntar(nomes.slice(0, 2), nomes.length) : `${item.publico.length} ${plural(item.publico.length, 'selecionado', 'selecionados')}`
}

export const isConcluida = (p: Participacao) => Boolean(p.concluidoEm)

export const PUSH = { pendente: 100000000, enviado: 100000001, falhou: 100000002 } as const
export const LEMBRETE_INTERVALO_MS = 24 * 60 * 60 * 1000

export function pushLabel(p: Participacao) {
  if (p.pushStatus === PUSH.enviado) return 'Push enviado'
  if (p.pushStatus === PUSH.falhou) return `Push falhou · ${p.pushErro || 'erro não informado'}`
  if (p.pushStatus === PUSH.pendente) return 'Push na fila'
  return 'Sem push'
}

/** Espelha a regra da Custom API cr40f_LembrarTreinamento: pendente, sem push na fila e sem lembrete nas últimas 24 h. A regra vale no servidor; aqui é só dica de UI. */
export function podeLembrar(p: Participacao, agora: number) {
  if (isConcluida(p) || p.pushStatus === PUSH.pendente) return false
  return !p.lembradoEm || agora - Date.parse(p.lembradoEm) >= LEMBRETE_INTERVALO_MS
}

/** Participação criada por uma publicação interrompida: o funcionário saiu do público e o motorista ainda não fez nada. */
export const isOrfa = (p: Participacao, alvoIds: Set<string>) => !alvoIds.has(p.funcionarioId) && !p.abertoEm && !p.confirmadoEm && !p.assinadoEm && p.nota == null && !p.concluidoEm

export type FiltroParticipacao = 'todos' | 'pendentes' | 'concluidos' | 'reprovados'
export function matchParticipacao(filtro: FiltroParticipacao, p: Participacao) {
  if (filtro === 'pendentes') return !isConcluida(p)
  if (filtro === 'concluidos') return isConcluida(p)
  if (filtro === 'reprovados') return p.nota != null && p.aprovado === false && !isConcluida(p)
  return true
}

/** Publicado com validade passada; quem não concluiu vira pendência. */
export const isVencido = (item: Treinamento, hoje: string) => isPublicado(item) && Boolean(item.validade) && item.validade < hoje


export type Bloco = { tipo: 'h'; texto: string } | { tipo: 'p'; texto: string } | { tipo: 'ul'; itens: string[] }

/** Marcação simples do conteúdo: `# Título`, `- item` e parágrafos separados por linha em branco. */
export function blocosDoConteudo(conteudo: string): Bloco[] {
  const blocos: Bloco[] = []
  let paragrafo: string[] = []
  const fecharParagrafo = () => { if (paragrafo.length) { blocos.push({ tipo: 'p', texto: paragrafo.join('\n') }); paragrafo = [] } }
  for (const linha of conteudo.replace(/\r\n/g, '\n').split('\n')) {
    const item = /^\s*[-*•]\s+(.*)$/.exec(linha)
    const titulo = /^\s*#{1,3}\s*(\S.*)$/.exec(linha)
    if (item) {
      fecharParagrafo()
      const anterior = blocos[blocos.length - 1]
      if (anterior?.tipo === 'ul') anterior.itens.push(item[1])
      else blocos.push({ tipo: 'ul', itens: [item[1]] })
    } else if (titulo) {
      fecharParagrafo()
      blocos.push({ tipo: 'h', texto: titulo[1] })
    } else if (!linha.trim()) fecharParagrafo()
    else paragrafo.push(linha)
  }
  fecharParagrafo()
  return blocos
}

/** Trechos de uma linha: texto comum e `**negrito**`, na ordem. */
export function trechos(texto: string): { negrito: boolean; texto: string }[] {
  return texto.split(/(\*\*[^*]+\*\*)/).filter(Boolean).map((parte) => (/^\*\*[^*]+\*\*$/.test(parte) ? { negrito: true, texto: parte.slice(2, -2) } : { negrito: false, texto: parte }))
}
