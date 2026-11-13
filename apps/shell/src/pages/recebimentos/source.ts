import type { Host } from '../../host'
import type { Arquivo } from '../../lib/comprovantes/arquivo'
import { createArquivos } from '../../lib/comprovantes/leitura'
import { createMockArquivo } from '../../lib/comprovantes/mock'
import { latenciaMock } from '../../app/latenciaMock'
import type { Recebimento } from './domain'
import { contarPorReserva, loadRecebimentos } from './queries'
import { mockRecebimentos } from './mock'

export type RecebimentosSource = {
  /** Comprovantes dos serviços (ids das reservas). */
  carregar: (reservaIds: string[]) => Promise<Recebimento[]>
  /** Contagem por serviço, para o indicador da lista. */
  contar: (reservaIds: string[]) => Promise<Map<string, number>>
  /** Conteúdo para a prévia; cache por sessão, compartilhado entre as fichas. */
  arquivo: (r: Recebimento) => Promise<Arquivo>
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, latenciaMock(ms)))

function createMock(): RecebimentosSource {
  const carregar = async (ids: string[]) => { await wait(250); return ids.flatMap(mockRecebimentos) }
  return {
    carregar,
    contar: async (ids) => new Map(ids.map((id) => [id.toLowerCase(), mockRecebimentos(id).length] as const).filter(([, n]) => n > 0)),
    async arquivo(r) {
      await wait(400)
      if (r.midia === 'video') throw new Error('No modo local o vídeo não é baixado.')
      return createMockArquivo(r)
    },
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
      arquivo: createArquivos(host.client),
    }
    porHost.set(host, source)
  }
  return source
}
