import { cleanId, type Row } from '@betinhos/dataverse'
import type { Matriz } from '@betinhos/app-config'
import type { Host } from '../../../host'
import { latenciaMock } from '../../../app/latenciaMock'
import { API, ENTITIES, mapRegistro, mapVersao, montarMotoristas, motoristasPath, pessoasPath, pushPath, versoesPath, type EntitySets } from './queries'
import { createMockStore } from './mock'
import type { Carga } from '../domain/types'

export type DefinirPessoa = {
  funcionarioId: string
  tipo: 'excecao' | 'piloto'
  chave?: string
  ligado?: boolean
  motivo?: string
  /** aaaa-mm-dd */
  validade?: string
  encerrar?: boolean
}

/** Tudo que a tela precisa do mundo externo; Dataverse em produção, memória no `pnpm dev`. Gravações só pelas Custom APIs. */
export type Source = {
  mock: boolean
  load: () => Promise<Carga>
  /** Grava (ou descarta) o rascunho. `base` = marca do rascunho que a tela abriu ('' quando não havia). Devolve a marca nova. */
  salvarRascunho: (matriz: Matriz | null, base: string, descartar?: boolean) => Promise<string>
  /** Publica o rascunho; devolve o número da versão. */
  publicar: (nota: string) => Promise<number>
  definirPessoa: (dados: DefinirPessoa) => Promise<void>
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, latenciaMock(ms)))

function createMockSource(): Source {
  const store = createMockStore()
  return {
    mock: true,
    async load() { await wait(350); return store.carga() },
    async salvarRascunho(matriz, base, descartar) { await wait(150); return store.salvarRascunho(matriz, base, descartar === true) },
    async publicar(nota) { await wait(300); return store.publicar(nota) },
    async definirPessoa(dados) { await wait(200); store.definirPessoa(dados) },
  }
}

type DataverseHost = Extract<Host, { mode: 'dataverse' }>

function createDataverseSource(host: DataverseHost): Source {
  let sets: Promise<EntitySets> | null = null
  const entitySets = () => (sets ??= host.metadata.entities([ENTITIES.versao, ENTITIES.pessoa, ENTITIES.funcionario]).then((m) => {
    const set = (name: string) => {
      const info = m.get(name)
      if (!info?.entitySetName) throw new Error(`A metadata não trouxe o entity set de ${name}.`)
      return info.entitySetName
    }
    return { versao: set(ENTITIES.versao), pessoa: set(ENTITIES.pessoa), funcionario: set(ENTITIES.funcionario) }
  }).catch((reason: unknown) => { sets = null; throw reason }))
  // O nome do set de push varia por ambiente (`new_inscricaopushmotoristas` no DEV). Sem a tabela, a coluna fica "sem push" e a tela segue.
  const pushSet = () => host.metadata.entities([ENTITIES.push]).then((m) => m.get(ENTITIES.push)?.entitySetName ?? null).catch(() => null)

  return {
    mock: false,
    async load() {
      const st = await entitySets()
      const [versoes, pessoas, funcionarios, push] = await Promise.all([
        host.client.getAll(versoesPath(st.versao)), host.client.getAll(pessoasPath(st.pessoa)),
        host.client.getAll(motoristasPath(st.funcionario)),
        pushSet().then((set): Promise<Row[]> | Row[] => (set ? host.client.getAll(pushPath(set)) : [])).catch((): Row[] => []),
      ])
      const comPush = new Set(push.map((r) => cleanId(String(r._new_funcionario_value ?? ''))).filter(Boolean))
      return { versoes: versoes.map(mapVersao), motoristas: montarMotoristas(funcionarios, pessoas.map(mapRegistro), comPush) }
    },
    async salvarRascunho(matriz, base, descartar) {
      const saida = await host.client.request<{ Marca?: string }>(API.salvarRascunho, {
        method: 'POST', body: JSON.stringify({ Conteudo: matriz ? JSON.stringify(matriz) : '', Base: base, Descartar: descartar === true }),
      })
      return saida.Marca ?? ''
    },
    async publicar(nota) {
      const saida = await host.client.request<{ Numero?: number }>(API.publicar, { method: 'POST', body: JSON.stringify({ Nota: nota }) })
      return Number(saida.Numero) || 0
    },
    async definirPessoa(d) {
      await host.client.request(API.definirPessoa, {
        method: 'POST',
        body: JSON.stringify({
          Funcionario: cleanId(d.funcionarioId), Tipo: d.tipo, Chave: d.chave ?? '', Ligado: d.ligado === true,
          Motivo: d.motivo ?? '', Validade: d.validade ?? '', Encerrar: d.encerrar === true,
        }),
      })
    },
  }
}

export function createSource(host: Host): Source {
  return host.mode === 'dataverse' ? createDataverseSource(host) : createMockSource()
}
