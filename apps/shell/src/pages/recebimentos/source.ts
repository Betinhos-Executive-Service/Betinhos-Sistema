import type { Host } from '../../host'
import type { Arquivo } from '../../lib/comprovantes/arquivo'
import { createArquivos } from '../../lib/comprovantes/leitura'
import { createMockArquivo } from '../../lib/comprovantes/mock'
import { createCarregarProvas, type CarregarProvas } from '../../lib/comprovantes/provaMidia'
import { latenciaMock } from '../../app/latenciaMock'
import type { FinanceiroServico, Recebimento } from './domain'
import { contarPorOp, contarPorReserva, loadFinanceiro, loadRecebimentos } from './queries'
import { mockContagemPorOp, mockFinanceiro, mockRecebimentos } from './mock'

export type RecebimentosSource = {
  /** Comprovantes dos serviços (ids das reservas). */
  carregar: (reservaIds: string[]) => Promise<Recebimento[]>
  /** Contagem por serviço, para o indicador da lista. */
  contar: (reservaIds: string[]) => Promise<Map<string, number>>
  /** Contagem por OP (soma dos comprovantes dos serviços dela), para a coluna das listas de OPs e Pagantes. */
  contarPorOp: (opIds: string[]) => Promise<Map<string, number>>
  /** Valor a receber, Receber e forma de pagamento do serviço (drawer do Geral). */
  financeiro: (reservaId: string) => Promise<FinanceiroServico>
  /** Conteúdo para a prévia; cache por sessão, compartilhado entre as fichas. */
  arquivo: (r: Recebimento) => Promise<Arquivo>
  /** Prova de captura do App Motoristas pelo link do comprovante (selos ao lado do anexo). */
  provas?: CarregarProvas
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, latenciaMock(ms)))

function createMock(): RecebimentosSource {
  return {
    carregar: async (ids) => { await wait(250); return ids.flatMap(mockRecebimentos) },
    financeiro: async (id) => { await wait(200); return mockFinanceiro(id) },
    contar: async (ids) => new Map(ids.map((id) => [id.toLowerCase(), mockRecebimentos(id).length] as const).filter(([, n]) => n > 0)),
    contarPorOp: async (ids) => mockContagemPorOp(ids),
    async arquivo(r) {
      await wait(400)
      if (r.midia === 'video') throw new Error('No modo local o vídeo não é baixado.')
      return createMockArquivo(r)
    },
    provas: createCarregarProvas({ mode: 'mock' }),
  }
}

// Uma fonte por host: Geral, OP e Pagante dividem o cache de arquivos e a fila de buscas.
const porHost = new WeakMap<Host, RecebimentosSource>()

export function recebimentosSource(host: Host): RecebimentosSource {
  let source = porHost.get(host)
  if (!source) {
    source = host.mode === 'mock' ? createMock() : {
      carregar: (ids) => loadRecebimentos(host.client, ids),
      contar: (ids) => contarPorReserva(host.client, ids),
      contarPorOp: (ids) => contarPorOp(host.client, ids),
      financeiro: (id) => loadFinanceiro(host.client, id),
      arquivo: createArquivos(host.client),
      provas: createCarregarProvas(host),
    }
    porHost.set(host, source)
  }
  return source
}
