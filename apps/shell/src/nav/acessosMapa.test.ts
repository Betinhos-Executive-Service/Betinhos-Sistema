import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import mapaJson from './acessosMapa.json'
import { MENU } from './menu'

type Classe = 'donas' | 'filhas' | 'cria' | 'edita' | 'leitura'
type Modulo = Partial<Record<Classe, string[]>>
/** `ignorar[].perfis` limita a exceção a esses perfis da rota; sem ele vale para todos. */
type Rota = { perfis?: string[]; pastas: string[]; ignorar?: { tabela: string; motivo: string; perfis?: string[] }[] }
type Base = { leitura: string[]; proprio: string[]; cria: string[]; donas: string[]; sistema: Record<string, Record<string, string>> }
type Mapa = { base: Base; modulos: Record<string, Modulo>; foraDosPerfis: { tabela: string; motivo: string }[]
  travaSoLeitura: { tabela: string; motivo: string }[]; colunasSoAdmin: { tabela: string; coluna: string; motivo: string }[]; rotas: Record<string, Rota> }

const mapa = mapaJson as unknown as Mapa
const RAIZ = fileURLToPath(new URL('../../../../', import.meta.url))
const catalogo = JSON.parse(readFileSync(join(RAIZ, 'packages/deploy/acessos/tabelas.json'), 'utf8')) as { logico: string; conjunto: string }[]
const porNome = new Map<string, string>()
// Tabela sem prefixo de publicador (bot, card, tag...) e de sistema: casa com palavra comum do codigo e o Base ja a cobre pela copia do Basic User.
for (const t of catalogo.filter((c) => c.logico.includes('_'))) {
  porNome.set(t.logico, t.logico)
  porNome.set(t.conjunto, t.logico)
}
const nomes = [...porNome.keys()].sort((a, b) => b.length - a.length)
const ACHA = new RegExp(`(?<![A-Za-z0-9_])(${nomes.join('|')})(?![A-Za-z0-9_])`, 'g')

const PERFIS = ['operacional', 'financeiro', 'frota', 'rh', 'acessos']
const SEM_PERFIL = ['inicio', 'planner']
const CLASSES: Classe[] = ['donas', 'filhas', 'cria', 'edita', 'leitura']
const FILHAS: Record<string, string[]> = {
  operacional: ['cr40f_cotacaoopcao', 'cr40f_cotacaoopcaoitem'],
  financeiro: ['cr40f_cotacaoopcao', 'cr40f_cotacaoopcaoitem', 'cr40f_itempagamentoaterceiro'],
  frota: ['cr40f_fotoequipamento'],
  rh: ['cr40f_treinamentoparticipacao'],
  acessos: [],
}

function arquivos(pasta: string): string[] {
  const saida: string[] = []
  for (const nome of readdirSync(pasta)) {
    const caminho = join(pasta, nome)
    if (statSync(caminho).isDirectory()) saida.push(...arquivos(caminho))
    else if (/\.(ts|tsx|js|mjs)$/.test(nome) && !nome.includes('.test.')) saida.push(caminho)
  }
  return saida
}

const itens = MENU.flatMap((g) => g.items)

function tabelasDaRota(id: string, rota: Rota): string[] {
  const achadas = new Set<string>()
  for (const pasta of rota.pastas)
    for (const arquivo of arquivos(join(RAIZ, pasta)))
      for (const m of readFileSync(arquivo, 'utf8').matchAll(ACHA)) {
        const logico = porNome.get(m[1] ?? '')
        if (logico) achadas.add(logico)
      }
  const item = itens.find((i) => i.id === id)
  if (item?.kind === 'entity') achadas.add(item.entity)
  return [...achadas].sort()
}

// base.cria nao entra: quem so cria nao le.
const daBase = new Set([...mapa.base.leitura, ...mapa.base.proprio, ...mapa.base.donas, ...Object.keys(mapa.base.sistema)])
const cobertas = new Set([...daBase, ...mapa.base.cria, ...Object.values(mapa.modulos).flatMap((m) => CLASSES.flatMap((c) => m[c] ?? []))])
const doModulo = (perfil: string) => new Set(CLASSES.flatMap((c) => mapa.modulos[perfil]?.[c] ?? []))

describe('mapa de acessos', () => {
  it('toda rota do mapa existe no menu', () => {
    const ids = new Set(itens.map((i) => i.id))
    expect(Object.keys(mapa.rotas).filter((id) => !ids.has(id))).toEqual([])
  })

  it('todo item do menu está no mapa e, fora das rotas livres, tem perfil', () => {
    expect(itens.filter((i) => !mapa.rotas[i.id]).map((i) => i.id)).toEqual([])
    const semPerfil = itens.filter((i) => !SEM_PERFIL.includes(i.id) && !mapa.rotas[i.id]?.perfis?.length).map((i) => i.id)
    expect(semPerfil).toEqual([])
  })

  it('só usa perfis conhecidos', () => {
    const usados = Object.values(mapa.rotas).flatMap((r) => r.perfis ?? [])
    expect([...new Set(usados)].filter((p) => !PERFIS.includes(p))).toEqual([])
    expect(Object.keys(mapa.modulos).sort()).toEqual(['acessos', 'financeiro', 'frota', 'operacional', 'rh'])
  })

  it('cada perfil da rota alcança as tabelas que a tela usa', () => {
    const falhas: string[] = []
    for (const [id, rota] of Object.entries(mapa.rotas)) {
      const ignorada = (tabela: string, perfil: string | null) => (rota.ignorar ?? []).some((i) => i.tabela === tabela && (!i.perfis || (perfil != null && i.perfis.includes(perfil))))
      const tabelas = tabelasDaRota(id, rota).filter((t) => !daBase.has(t))
      const perfis: (string | null)[] = rota.perfis?.length ? rota.perfis : [null]
      for (const perfil of perfis)
        for (const tabela of tabelas) if (!ignorada(tabela, perfil) && (!perfil || !doModulo(perfil).has(tabela))) falhas.push(`${id}: ${tabela} (${perfil ?? 'base'})`)
    }
    expect(falhas).toEqual([])
  })

  it('uma tabela tem uma classe só dentro do módulo', () => {
    const repetidas: string[] = []
    for (const [nome, modulo] of Object.entries(mapa.modulos)) {
      const vistas = new Set<string>()
      for (const classe of CLASSES)
        for (const tabela of modulo[classe] ?? []) {
          if (vistas.has(tabela)) repetidas.push(`${nome}: ${tabela}`)
          vistas.add(tabela)
        }
    }
    expect(repetidas).toEqual([])
  })

  it('linhas-filhas (Operador exclui) são só as combinadas', () => {
    for (const [nome, modulo] of Object.entries(mapa.modulos)) expect([...(modulo.filhas ?? [])].sort(), nome).toEqual(FILHAS[nome])
  })

  it('toda tabela do mapa existe no catálogo', () => {
    const doMapa = [
      ...mapa.base.leitura,
      ...mapa.base.proprio,
      ...mapa.base.cria,
      ...mapa.base.donas,
      ...Object.values(mapa.modulos).flatMap((m) => CLASSES.flatMap((c) => m[c] ?? [])),
    ]
    const logicos = new Set(catalogo.map((t) => t.logico))
    expect([...new Set(doMapa)].filter((t) => !logicos.has(t)).sort()).toEqual([])
  })

  // Corte no PROD: tabela customizada sem perfil some para quem perde o administrador.
  it('toda tabela cr40f_/new_ do catálogo tem perfil ou está fora dos perfis com motivo', () => {
    const fora = new Set(mapa.foraDosPerfis.map((f) => f.tabela))
    const customizadas = catalogo.map((t) => t.logico).filter((t) => /^(cr40f|new)_/.test(t))
    expect(customizadas.filter((t) => !cobertas.has(t) && !fora.has(t)).sort(), 'sem perfil').toEqual([])
    expect([...fora].filter((t) => cobertas.has(t)).sort(), 'com perfil e fora').toEqual([])
    expect([...fora].filter((t) => !customizadas.includes(t)).sort(), 'fora do catálogo').toEqual([])
    expect(mapa.foraDosPerfis.filter((f) => !f.motivo?.trim()).map((f) => f.tabela)).toEqual([])
  })

  // Exceções da trava do corte: só valem com motivo e sobre tabela que tem perfil.
  it('exceções da trava do corte têm motivo e tabela com perfil', () => {
    const excecoes = [...mapa.travaSoLeitura, ...mapa.colunasSoAdmin]
    expect(excecoes.filter((f) => !cobertas.has(f.tabela) || !f.motivo?.trim()).map((f) => f.tabela)).toEqual([])
  })

  it('exceção por perfil só cita perfis da rota', () => {
    const fora = Object.entries(mapa.rotas).flatMap(([id, r]) => (r.ignorar ?? []).flatMap((i) => (i.perfis ?? []).filter((p) => !r.perfis?.includes(p)).map((p) => `${id}: ${i.tabela} (${p})`)))
    expect(fora).toEqual([])
  })

  it('toda exceção tem motivo', () => {
    const semMotivo = Object.entries(mapa.rotas).flatMap(([id, r]) => (r.ignorar ?? []).filter((i) => !i.motivo?.trim()).map((i) => `${id}: ${i.tabela}`))
    expect(semMotivo).toEqual([])
  })

  it('local só lista tabela dona ou filha do próprio módulo', () => {
    for (const [nome, modulo] of Object.entries(mapa.modulos) as [string, Record<string, string[] | undefined>][]) {
      const suas = new Set([...(modulo.donas ?? []), ...(modulo.filhas ?? [])])
      for (const tabela of modulo.local ?? []) expect(suas.has(tabela), `${nome}: ${tabela}`).toBe(true)
    }
  })
})
