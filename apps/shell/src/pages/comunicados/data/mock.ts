import { COMUNICADO_ESCOPO, COMUNICADO_ESTADO, COMUNICADO_PUSH, COMUNICADO_TIPO, isDisparado, validateDraft, type Comunicado, type Destinatario, type Motorista } from '../domain/comunicados'
import type { Source } from './source'

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const id = (n: number) => `dddddddd-0000-4000-8000-${String(n).padStart(12, '0')}`
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

const MOTORISTAS: Motorista[] = [
  { id: id(1), nome: 'Carlos Andrade', email: 'carlos@betinhos.mock', problema: '' },
  { id: id(2), nome: 'Márcio Lima', email: 'marcio@betinhos.mock', problema: '' },
  { id: id(3), nome: 'Rafael Souza', email: 'rafael@betinhos.mock', problema: '' },
  { id: id(4), nome: 'Paulo Henrique', email: '', problema: 'Sem e-mail Microsoft' },
]

// Assinatura curta em coordenadas 0–1, só para o relatório mostrar o desenho.
const ASSINATURA = JSON.stringify([[[0.1, 0.6], [0.2, 0.3], [0.3, 0.7], [0.45, 0.35], [0.6, 0.65], [0.75, 0.4], [0.9, 0.55]]])

function destinatario(n: number, comunicadoId: string, motoristaId: string, enviadoEm: string, extra: Partial<Destinatario> = {}): Destinatario {
  return { id: id(100 + n), comunicadoId, motoristaId, enviadoEm, abertoEm: null, lidoEm: null, cienteEm: null, nomeAssinante: '', observacao: '', assinaturaJson: '', pushStatus: COMUNICADO_PUSH.enviado, pushErro: '', ...extra }
}

/** Dados de exemplo do `pnpm dev`: um com assinatura (com falha de push e observação), um informativo e um rascunho. */
export function createMockSource(): Source {
  const ontem = new Date(Date.now() - 86400000).toISOString()
  const hoje = new Date(Date.now() - 3600000).toISOString()
  const comunicados: Comunicado[] = [
    { id: id(10), titulo: 'Novo procedimento de embarque no GRU', corpo: 'A partir de segunda, o ponto de encontro no Terminal 3 passa a ser a porta 4. Confirme a ciência assinando abaixo.', tipo: COMUNICADO_TIPO.ciencia, escopo: COMUNICADO_ESCOPO.todos, alvoIds: [], estado: COMUNICADO_ESTADO.disparado, disparadoEm: hoje },
    { id: id(11), titulo: 'Feriado: escala do fim de semana', corpo: 'A escala do feriado já está no app. Confira seus horários.', tipo: COMUNICADO_TIPO.informativo, escopo: COMUNICADO_ESCOPO.selecionados, alvoIds: [id(1), id(2)], estado: COMUNICADO_ESTADO.disparado, disparadoEm: ontem },
    { id: id(12), titulo: 'Revisão dos veículos', corpo: 'Traga o veículo para a revisão trimestral até sexta.', tipo: COMUNICADO_TIPO.informativo, escopo: COMUNICADO_ESCOPO.todos, alvoIds: [], estado: COMUNICADO_ESTADO.rascunho, disparadoEm: null },
  ]
  const destinatarios: Destinatario[] = [
    destinatario(1, id(10), id(1), hoje, { abertoEm: hoje, cienteEm: hoje, nomeAssinante: 'Carlos Andrade', assinaturaJson: ASSINATURA, observacao: 'Combinado, mas a porta 4 fica fechada depois das 23h.' }),
    destinatario(2, id(10), id(2), hoje, { abertoEm: hoje }),
    destinatario(3, id(10), id(3), hoje, { pushStatus: COMUNICADO_PUSH.falhou, pushErro: 'Dispositivo não registrado' }),
    destinatario(4, id(11), id(1), ontem, { abertoEm: ontem, lidoEm: ontem }),
    destinatario(5, id(11), id(2), ontem),
  ]
  let seq = 200

  return {
    mock: true,
    async comunicados() { await wait(300); return clone(comunicados) },
    async destinatarios(comunicadoId) { await wait(300); return clone(destinatarios.filter((row) => row.comunicadoId === comunicadoId)) },
    async motoristas() { await wait(200); return clone(MOTORISTAS) },
    async salvar(draft) {
      await wait(300)
      const error = validateDraft(draft)
      if (error) throw new Error(error)
      const existing = comunicados.find((item) => item.id === draft.id)
      if (existing && isDisparado(existing)) throw new Error('Comunicado já disparado não pode ser editado.')
      const item: Comunicado = { ...clone(draft), id: existing?.id || id((seq += 1)), estado: COMUNICADO_ESTADO.rascunho, disparadoEm: null }
      if (existing) Object.assign(existing, item)
      else comunicados.unshift(item)
      return item.id
    },
    async excluir(comunicadoId) {
      await wait(300)
      const index = comunicados.findIndex((item) => item.id === comunicadoId && !isDisparado(item))
      if (index < 0) throw new Error('Somente rascunhos podem ser excluídos.')
      comunicados.splice(index, 1)
    },
    async disparar(comunicadoId) {
      await wait(400)
      const item = comunicados.find((row) => row.id === comunicadoId)
      if (!item) throw new Error('Comunicado não encontrado.')
      if (isDisparado(item)) throw new Error('Comunicado já disparado.')
      const aptos = MOTORISTAS.filter((m) => !m.problema && (item.escopo === COMUNICADO_ESCOPO.todos || item.alvoIds.includes(m.id)))
      if (!aptos.length) throw new Error('Nenhum motorista selecionado.')
      const now = new Date().toISOString()
      item.estado = COMUNICADO_ESTADO.disparado
      item.disparadoEm = now
      destinatarios.push(...aptos.map((m) => destinatario((seq += 1), item.id, m.id, now)))
    },
    async reenviar(destinatarioId) {
      await wait(300)
      const row = destinatarios.find((item) => item.id === destinatarioId)
      if (!row) throw new Error('Destinatário não encontrado.')
      row.pushStatus = COMUNICADO_PUSH.enviado
      row.pushErro = ''
    },
  }
}
