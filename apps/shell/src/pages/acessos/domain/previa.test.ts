import { describe, expect, it } from 'vitest'
import colunasJson from '../../../nav/acessosColunas.json'
import { GRUPO_ROTULO, acoes, registrosTexto, lerPrevia, lerUso, montarResumo, rotuloDaColuna, tabelasParaMedir, usoTexto, type Previa } from './previa'
import type { PerfisPessoa } from './types'

const vazia: Previa = { admin: { antes: false, depois: false }, perdas: [], colunas: [], grupos: [], apps: [], flows: [], conexoes: [] }
const operador: PerfisPessoa = { areas: { financeiro: 'operador' }, acessos: false }
const nenhum: PerfisPessoa = { areas: {}, acessos: false }

describe('prévia: texto', () => {
  it('traduz as ações na ordem de leitura e junta Append e AppendTo em "vincular"', () => {
    expect(acoes(['Delete', 'Read', 'AppendTo', 'Append', 'Write', 'Create', 'Assign', 'Share'])).toEqual(['ver', 'criar', 'editar', 'excluir', 'vincular', 'atribuir', 'compartilhar'])
  })

  it('todo grupo de colunas do JSON tem rótulo', () => {
    const grupos = new Set(Object.values(colunasJson.grupos as Record<string, Record<string, string[]>>).flatMap((g) => Object.keys(g)))
    expect([...grupos].filter((g) => !GRUPO_ROTULO[g])).toEqual([])
  })

  it('agrupa a coluna pelo rótulo do grupo e manda a não mapeada para "Outras colunas"', () => {
    const [tabela, grupos] = Object.entries(colunasJson.grupos as Record<string, Record<string, string[]>>)[0]
    const [grupo, colunas] = Object.entries(grupos)[0]
    expect(rotuloDaColuna({ coluna: `${tabela}.${colunas[0]}`, perde: ['ler'], incerto: false })).toContain(GRUPO_ROTULO[grupo])
    expect(rotuloDaColuna({ coluna: 'cr40f_inventada.coluna', perde: ['ler'], incerto: false })).toBe('Outras colunas')
    expect(rotuloDaColuna({ coluna: `${tabela}.${colunas[0]}`, rotulo: 'Nome do Dataverse', perde: ['ler'], incerto: false })).toBe(`Nome do Dataverse: ${GRUPO_ROTULO[grupo]}`)
  })

  it('descreve o uso em 90 dias', () => {
    expect(usoTexto({ tabela: 't', registros: 37, limitado: false, incerto: false })).toBe('criou ou alterou 37 registros em 90 dias')
    expect(usoTexto({ tabela: 't', registros: 1, limitado: false, incerto: false })).toBe('criou ou alterou 1 registro em 90 dias')
    expect(usoTexto({ tabela: 't', registros: 0, limitado: false, incerto: false })).toBe('sem gravação em 90 dias (leitura não é registrada)')
    expect(usoTexto({ tabela: 't', registros: null, limitado: false, incerto: true })).toBe('não deu para medir')
    expect(usoTexto({ tabela: 't', registros: 5000, limitado: true, incerto: false })).toBe('criou ou alterou 5000+ registros em 90 dias')
    expect(usoTexto(null)).toBeNull()
    expect(registrosTexto(5000, true)).toBe('5000+ registros')
    expect(registrosTexto(12, false)).toBe('12 registros')
  })

  it('lê a resposta da API do texto e recusa a que vem sem o formato', () => {
    const previa = lerPrevia(JSON.stringify({ ...vazia, admin: { antes: true, depois: false }, perdas: [{ chave: 'a', tabela: 'cr40f_x', rotulo: 'X', perde: ['Read'], incerto: false }] }))
    expect(previa.admin).toEqual({ antes: true, depois: false })
    expect(previa.perdas[0].rotulo).toBe('X')
    expect(() => lerPrevia('{"admin":{"antes":true,"depois":false},"perdas":[]}')).toThrow()
    expect(() => lerPrevia('null')).toThrow()
    expect(lerUso('{"uso":[{"tabela":"cr40f_x","registros":null,"limitado":false,"incerto":true}]}')).toHaveLength(1)
    expect(() => lerUso('{"uso":null}')).toThrow()
  })

  it('mede no máximo 200 tabelas, sem repetir', () => {
    const perdas = Array.from({ length: 230 }, (_, i) => ({ chave: `c${i}`, tabela: `cr40f_t${i % 220}`, rotulo: null, perde: ['Read'], incerto: false }))
    expect(tabelasParaMedir({ ...vazia, perdas })).toHaveLength(200)
  })

  it('não pede o uso de cr40f_segredo (o servidor recusa e derrubaria a medição toda)', () => {
    const perdas = ['cr40f_segredo', 'cr40f_financeiro'].map((tabela) => ({ chave: tabela, tabela, rotulo: null, perde: ['Read'], incerto: false }))
    expect(tabelasParaMedir({ ...vazia, perdas })).toEqual(['cr40f_financeiro'])
  })
})

describe('prévia: resumo e confirmação', () => {
  it('sem perda nenhuma diz que não perde nada e salva direto', () => {
    const r = montarResumo(vazia, [], operador, operador)
    expect(r.vazio).toBe(true)
    expect(r.precisaConfirmar).toBe(false)
  })

  it('perder a área tira as telas do menu e pede confirmação', () => {
    const r = montarResumo({ ...vazia, perdas: [{ chave: 'f', tabela: 'cr40f_financeiro', rotulo: null, perde: ['Read', 'Write'], incerto: false }] }, [{ tabela: 'cr40f_financeiro', registros: 0, limitado: false, incerto: false }], operador, nenhum)
    expect(r.telasSomem.length).toBeGreaterThan(0)
    expect(r.precisaConfirmar).toBe(true)
  })

  it('perder só excluir sem uso salva direto; com uso pede confirmação', () => {
    const previa: Previa = { ...vazia, perdas: [{ chave: 'f', tabela: 'cr40f_financeiro', rotulo: null, perde: ['Delete'], incerto: false }] }
    expect(montarResumo(previa, [{ tabela: 'cr40f_financeiro', registros: 0, limitado: false, incerto: false }], operador, operador).precisaConfirmar).toBe(false)
    expect(montarResumo(previa, [{ tabela: 'cr40f_financeiro', registros: 12, limitado: false, incerto: false }], operador, operador).precisaConfirmar).toBe(true)
    expect(montarResumo(previa, null, operador, operador).precisaConfirmar).toBe(true)
  })

  it('coluna, flow, conexão ou item incerto pedem confirmação', () => {
    expect(montarResumo({ ...vazia, colunas: [{ coluna: 'cr40f_x.y', perde: ['gravar'], incerto: false }] }, [], operador, operador).precisaConfirmar).toBe(true)
    expect(montarResumo({ ...vazia, flows: [{ nome: 'F', tipo: 'tabela', dona: true }] }, [], operador, operador).precisaConfirmar).toBe(true)
    expect(montarResumo({ ...vazia, apps: [{ nome: 'App' }] }, [], operador, operador).precisaConfirmar).toBe(true)
    expect(montarResumo({ ...vazia, conexoes: [{ nome: 'C' }] }, [], operador, operador).precisaConfirmar).toBe(true)
    expect(montarResumo({ ...vazia, perdas: [{ chave: 'p', tabela: null, rotulo: null, perde: ['Delete'], incerto: true }] }, [], operador, operador).precisaConfirmar).toBe(true)
  })

  it('o que não tem tela no mapa vai para "outras" e a tabela medida traz o uso', () => {
    const r = montarResumo({ ...vazia, perdas: [{ chave: 'prvExportToExcel', tabela: null, rotulo: null, perde: ['Use'], incerto: false }] }, [], operador, operador)
    expect(r.outras.map((i) => i.chave)).toEqual(['prvExportToExcel'])
    expect(r.areas).toEqual([])
  })

  it('quem perde o acesso total (administrador) vê as telas sumirem pelo menu antes e depois', () => {
    const r = montarResumo({ ...vazia, admin: { antes: true, depois: false } }, [], nenhum, nenhum)
    expect(r.telasSomem.length).toBeGreaterThan(0)
    expect(r.vazio).toBe(false)
  })

  it('coluna diz o que perde e o app entra no resumo', () => {
    const r = montarResumo({ ...vazia, colunas: [{ coluna: 'cr40f_x.y', perde: ['criar', 'gravar'], incerto: false }], apps: [{ nome: 'App' }] }, [], operador, operador)
    expect(r.colunas[0].acoes).toEqual(['criar', 'editar'])
    expect(r.apps).toEqual(['App'])
  })
})
