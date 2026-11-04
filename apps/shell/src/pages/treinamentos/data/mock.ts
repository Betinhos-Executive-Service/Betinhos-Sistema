import { todaySaoPaulo } from '@betinhos/ui'
import { ESTADO, PUBLICO, PUSH, isOrfa, podeLembrar, isPublicado, validarComConteudo, validarRascunho, type Funcionario, type Participacao, type Treinamento } from '../domain/treinamentos'
import type { Linha } from '../domain/lista'
import { contarProgresso } from '../domain/tabela'
import type { Source } from './source'

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const id = (n: number) => `eeeeeeee-0000-4000-8000-${String(n).padStart(12, '0')}`
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T
// Conta a partir do dia de São Paulo, o mesmo "hoje" da tela; com o dia UTC, entre 21h e 24h a validade saía um dia errada.
const dia = (dias: number) => new Date(Date.parse(todaySaoPaulo()) + dias * 86400000).toISOString().slice(0, 10)

const FUNCIONARIOS: Funcionario[] = [
  { id: id(1), nome: 'Carlos Alberto Teste', apelido: 'Carlos', funcao: 202410000, ativo: true },
  { id: id(2), nome: 'Márcio Lima', apelido: 'Márcio', funcao: 202410000, ativo: true },
  { id: id(3), nome: 'Rafael Souza', apelido: 'Rafael', funcao: 202410000, ativo: true },
  { id: id(4), nome: 'Bruna Ficticia Lima', apelido: 'Bruna', funcao: 202410001, ativo: true },
  { id: id(5), nome: 'Gustavo Amostra Pires', apelido: 'Gustavo', funcao: 202410000, ativo: false },
]

// Assinatura curta em coordenadas 0–1, só para o painel mostrar o desenho.
const ASSINATURA = JSON.stringify([[[0.1, 0.6], [0.2, 0.3], [0.3, 0.7], [0.45, 0.35], [0.6, 0.65], [0.75, 0.4], [0.9, 0.55]]])

// Versão lida fictícia (formato v1 gravado pelo App) e hash de mentira: só para o mock mostrar o comprovante.
const SNAPSHOT_MOCK = JSON.stringify({
  v: 1, titulo: 'Embarque no GRU: novo procedimento', descricao: 'Ponto de encontro, antecedência e contato com a operação.',
  conteudo: '# Ponto de encontro\nO encontro é na **porta 2** do Terminal 3.\n\n- Chegue com 20 minutos de antecedência\n- Placa com o nome do passageiro sempre visível',
  videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', anexos: [{ nome: 'mapa-terminal-3.pdf', tamanho: 348_212 }], exigeAssinatura: true, exigeQuiz: true, notaMinima: 70, publicadoEm: '2026-11-01T13:00:00.000Z', editadoEm: null,
})

const QUIZ = [
  { id: 'q1', texto: 'Qual a porta de encontro no Terminal 3?', alternativas: [{ id: 'a', texto: 'Porta 2' }, { id: 'b', texto: 'Porta 4' }, { id: 'c', texto: 'Porta 6' }], corretaId: 'b' },
  { id: 'q2', texto: 'Com quanto tempo de antecedência o motorista chega?', alternativas: [{ id: 'a', texto: '10 minutos' }, { id: 'b', texto: '30 minutos' }], corretaId: 'b' },
  { id: 'q3', texto: 'O que fazer se o voo atrasar?', alternativas: [{ id: 'a', texto: 'Ir embora' }, { id: 'b', texto: 'Avisar a operação e aguardar' }], corretaId: 'b' },
]

function participacao(n: number, treinamentoId: string, funcionarioId: string, extra: Partial<Participacao> = {}): Participacao {
  return { id: id(100 + n), treinamentoId, funcionarioId, abertoEm: null, confirmadoEm: null, assinadoEm: null, nomeAssinante: '', assinaturaJson: '', nota: null, aprovado: null, tentativas: 0, concluidoEm: null, pushStatus: PUSH.enviado, pushErro: '', lembradoEm: null, conteudoSnapshot: '', conteudoHash: '', ...extra }
}

/** Dados de exemplo do `pnpm dev`: um publicado completo (vídeo, anexo, assinatura, quiz), um vencido e um rascunho. */
export function createMockSource(): Source {
  const ontem = new Date(Date.now() - 86400000).toISOString()
  const hoje = new Date(Date.now() - 3600000).toISOString()
  const treinamentos: Linha[] = [
    {
      id: id(10), titulo: 'Embarque no GRU: novo procedimento', descricao: 'Ponto de encontro, antecedência e contato com a operação.',
      conteudo: '# Ponto de encontro\nA partir de segunda o encontro é na **porta 4** do Terminal 3.\n\n- Chegue com 30 minutos de antecedência\n- Placa com o nome do passageiro sempre visível\n- Voo atrasado: avise a operação e aguarde',
      videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', anexos: [{ nome: 'mapa-terminal-3.pdf', caminho: 'Treinamentos/DEV/mock/mapa-terminal-3.pdf', tamanho: 348_212, mime: 'application/pdf' }, { nome: 'porta-4.jpg', caminho: 'Treinamentos/DEV/mock/porta-4.jpg', tamanho: 88_120, mime: 'image/jpeg' }],
      publicoTipo: PUBLICO.motoristas, publico: [], exigeAssinatura: true, exigeQuiz: true, notaMinima: 70, perguntas: QUIZ, validade: dia(15), estado: ESTADO.publicado, publicadoEm: hoje, editadoEm: null, criadoEm: hoje,
    },
    {
      id: id(11), titulo: 'Direção defensiva: revisão anual', descricao: 'Vídeo obrigatório com confirmação de leitura.',
      conteudo: 'Assista ao vídeo até o fim e confirme a leitura.', videoUrl: 'https://vimeo.com/123456', anexos: [],
      publicoTipo: PUBLICO.selecionados, publico: [id(1), id(2), id(5)], exigeAssinatura: false, exigeQuiz: false, notaMinima: 70, perguntas: [], validade: dia(-3), estado: ESTADO.publicado, publicadoEm: ontem, editadoEm: null, criadoEm: ontem,
    },
    {
      id: id(12), titulo: 'Atendimento a passageiros com mobilidade reduzida', descricao: '', conteudo: 'Rascunho em preparo.', videoUrl: '', anexos: [],
      publicoTipo: PUBLICO.funcao, publico: [], exigeAssinatura: true, exigeQuiz: false, notaMinima: 70, perguntas: [], validade: '', estado: ESTADO.rascunho, publicadoEm: null, editadoEm: null, criadoEm: ontem,
    },
  ]
  const participacoes: Participacao[] = [
    participacao(1, id(10), id(1), { abertoEm: hoje, confirmadoEm: hoje, assinadoEm: hoje, nomeAssinante: 'Carlos Alberto Teste', assinaturaJson: ASSINATURA, nota: 100, aprovado: true, tentativas: 1, concluidoEm: hoje, conteudoSnapshot: SNAPSHOT_MOCK, conteudoHash: '0'.repeat(64) }),
    participacao(2, id(10), id(2), { abertoEm: hoje, confirmadoEm: hoje, assinadoEm: hoje, nomeAssinante: 'Márcio Lima', assinaturaJson: ASSINATURA, nota: 33, aprovado: false, tentativas: 1 }),
    participacao(3, id(10), id(3), { abertoEm: hoje, pushStatus: PUSH.falhou, pushErro: 'Dispositivo não registrado' }),
    participacao(4, id(11), id(1), { abertoEm: ontem, confirmadoEm: ontem, concluidoEm: ontem }),
    participacao(5, id(11), id(2)),
    participacao(6, id(11), id(5), { abertoEm: ontem }),
  ]
  let seq = 200

  return {
    mock: true,
    async treinamentos() { await wait(300); return clone(treinamentos) },
    async funcionarios() { await wait(200); return clone(FUNCIONARIOS) },
    async participacoes(treinamentoId) { await wait(300); return clone(participacoes.filter((p) => p.treinamentoId === treinamentoId)) },
    async progresso() { await wait(150); return contarProgresso(participacoes.map((p) => ({ treinamentoId: p.treinamentoId, concluida: Boolean(p.concluidoEm) }))) },
    async salvar(draft) {
      await wait(300)
      const error = validarRascunho(draft)
      if (error) throw new Error(error)
      const existing = treinamentos.find((item) => item.id === draft.id)
      if (existing && isPublicado(existing)) throw new Error('Treinamento publicado não pode ser editado.')
      const item: Linha = { ...clone(draft), id: existing?.id || id((seq += 1)), estado: ESTADO.rascunho, publicadoEm: null, criadoEm: existing?.criadoEm ?? new Date().toISOString() }
      if (existing) Object.assign(existing, item)
      else treinamentos.unshift(item)
      return item.id
    },
    async salvarPublicado(item) {
      await wait(150)
      const error = validarComConteudo(item)
      if (error) throw new Error(error)
      const atual = treinamentos.find((row) => row.id === item.id)
      if (!atual || !isPublicado(atual)) throw new Error('Este treinamento não está publicado. Atualize a lista.')
      Object.assign(atual, { titulo: item.titulo.trim(), descricao: item.descricao.trim(), conteudo: item.conteudo.trim(), videoUrl: item.videoUrl.trim(), anexos: clone(item.anexos), validade: item.validade, editadoEm: new Date().toISOString() })
    },
    async excluir(treinamentoId) {
      await wait(300)
      const index = treinamentos.findIndex((item) => item.id === treinamentoId && !isPublicado(item))
      if (index < 0) throw new Error('Somente rascunhos podem ser excluídos.')
      treinamentos.splice(index, 1)
    },
    async salvarAnexos(treinamentoId, anexos, publicado = false) {
      await wait(200)
      const item = treinamentos.find((row) => row.id === treinamentoId)
      if (!item) throw new Error('Treinamento não encontrado.')
      item.anexos = clone(anexos)
      if (publicado) item.editadoEm = new Date().toISOString()
    },
    async publicar(treinamento, alvos) {
      await wait(400)
      const item = treinamentos.find((row) => row.id === treinamento.id)
      if (!item) throw new Error('Treinamento não encontrado.')
      const alvoIds = new Set(alvos.map((f) => f.id))
      for (let i = participacoes.length - 1; i >= 0; i--) if (participacoes[i].treinamentoId === item.id && isOrfa(participacoes[i], alvoIds)) participacoes.splice(i, 1)
      const jaTem = new Set(participacoes.filter((p) => p.treinamentoId === item.id).map((p) => p.funcionarioId))
      for (const f of alvos) if (!jaTem.has(f.id)) participacoes.push(participacao((seq += 1), item.id, f.id, { pushStatus: PUSH.pendente }))
      item.estado = ESTADO.publicado
      item.publicadoEm = new Date().toISOString()
    },
    async enviarAnexo(treinamentoId, file, existentes) {
      await wait(300)
      const nome = existentes.some((a) => a.nome === file.name) ? `${file.name} (2)` : file.name
      return { nome, caminho: `Treinamentos/DEV/${treinamentoId}/${nome}`, tamanho: file.size, mime: file.type || 'application/octet-stream' }
    },
    async lembrar(treinamentoId, participacaoId) {
      await wait(200)
      const agora = Date.now()
      const alvo = participacoes.filter((p) => p.treinamentoId === treinamentoId && (!participacaoId || p.id === participacaoId) && !p.concluidoEm)
      const aptas = alvo.filter((p) => podeLembrar(p, agora))
      for (const p of aptas) Object.assign(p, { pushStatus: PUSH.enviado, pushErro: '', lembradoEm: new Date(agora).toISOString() })
      return { enfileirados: aptas.length, ignorados: alvo.length - aptas.length }
    },
    async excluirAnexo() { await wait(200) },
    async abrirAnexo(anexo) { await wait(200); return { nome: anexo.nome, blob: new Blob([`Conteúdo de exemplo de ${anexo.nome}`], { type: 'text/plain' }) } },
  }
}
