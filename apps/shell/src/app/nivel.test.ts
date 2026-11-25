import { describe, expect, it } from 'vitest'
import { acessosDoMock, TODOS } from './acessos'
import { acessoColuna, acessoGrupo, podeExcluir, podeLer } from './nivel'

const p = (texto: string) => acessosDoMock(texto)

describe('podeExcluir', () => {
  it('tabela dona: só o Gestor da área (ou admin)', () => {
    expect(podeExcluir(p('financeiro:operador'), 'cr40f_composicaodeprecos')).toBe(false)
    expect(podeExcluir(p('financeiro:gestor'), 'cr40f_composicaodeprecos')).toBe(true)
    expect(podeExcluir(p('rh:operador'), 'cr40f_treinamento')).toBe(false)
    expect(podeExcluir(p('rh:gestor'), 'cr40f_treinamento')).toBe(true)
    expect(podeExcluir(p('operacional:operador'), 'new_comunicadomotorista')).toBe(false)
    expect(podeExcluir(p('operacional:gestor'), 'new_comunicadomotorista')).toBe(true)
    expect(podeExcluir(TODOS, 'cr40f_composicaodeprecos')).toBe(true)
  })

  it('Gestor de outra área não exclui', () => {
    expect(podeExcluir(p('rh:gestor'), 'cr40f_composicaodeprecos')).toBe(false)
  })

  it('tabela filha: qualquer nível da área', () => {
    expect(podeExcluir(p('financeiro:operador'), 'cr40f_itempagamentoaterceiro')).toBe(true)
    expect(podeExcluir(p('frota:operador'), 'cr40f_fotoequipamento')).toBe(true)
    expect(podeExcluir(p('rh:operador'), 'cr40f_fotoequipamento')).toBe(false)
  })

  it('tabelas do Base (Planner) valem para todos, inclusive sem perfil', () => {
    expect(podeExcluir(p('nenhum'), 'cr40f_plannertarefa')).toBe(true)
  })

  it('tabela fora do mapa: só admin', () => {
    expect(podeExcluir(p('financeiro:gestor,rh:gestor'), 'tabela_inexistente')).toBe(false)
    expect(podeExcluir(TODOS, 'tabela_inexistente')).toBe(true)
  })
})

describe('podeLer', () => {
  it('lê o que o módulo da área alcança em qualquer classe', () => {
    expect(podeLer(p('frota:operador'), 'cr40f_reservadeveculos')).toBe(true)
    expect(podeLer(p('financeiro:operador'), 'cr40f_fluxocaixalancamento')).toBe(true)
    expect(podeLer(p('operacional:operador'), 'cr40f_fluxocaixalancamento')).toBe(false)
    expect(podeLer(p('rh:operador'), 'cr40f_reservadeveculos')).toBe(false)
    expect(podeLer(p('acessos'), 'cr40f_funcionarios')).toBe(true)
  })

  it('Base vale para todos', () => {
    expect(podeLer(p('nenhum'), 'cr40f_plannertarefa')).toBe(true)
    expect(podeLer(p('nenhum'), 'cr40f_comunicadohome')).toBe(true)
  })
})

describe('acessoGrupo', () => {
  it('Funcionários: RH Operador edita básico, CNH e RH, não vê pessoal; Gestor edita pessoal', () => {
    expect(acessoGrupo(p('rh:operador'), 'cr40f_funcionarios.pessoal')).toEqual({ ler: false, editar: false })
    expect(acessoGrupo(p('rh:operador'), 'cr40f_funcionarios.rh')).toEqual({ ler: true, editar: true })
    expect(acessoGrupo(p('rh:gestor'), 'cr40f_funcionarios.pessoal')).toEqual({ ler: true, editar: true })
    expect(acessoGrupo(p('rh:gestor'), 'cr40f_funcionarios.rh')).toEqual({ ler: true, editar: true })
  })

  it('Administrador de acessos só lê o básico', () => {
    expect(acessoGrupo(p('acessos'), 'cr40f_funcionarios.basico')).toEqual({ ler: true, editar: false })
    expect(acessoGrupo(p('acessos'), 'cr40f_funcionarios.cnh')).toEqual({ ler: false, editar: false })
  })

  it('financeiro.valor: Operador lê, só o Gestor edita', () => {
    expect(acessoGrupo(p('financeiro:operador'), 'cr40f_financeiro.valor')).toEqual({ ler: true, editar: false })
    expect(acessoGrupo(p('financeiro:gestor'), 'cr40f_financeiro.valor')).toEqual({ ler: true, editar: true })
    expect(acessoGrupo(p('operacional:gestor'), 'cr40f_financeiro.valor')).toEqual({ ler: false, editar: false })
  })

  it('veiculos.patrimonio: Frota Operador lê pelo curinga, Gestor edita', () => {
    expect(acessoGrupo(p('frota:operador'), 'cr40f_veiculos.patrimonio')).toEqual({ ler: true, editar: false })
    expect(acessoGrupo(p('frota:gestor'), 'cr40f_veiculos.patrimonio')).toEqual({ ler: true, editar: true })
  })

  it('admin lê e edita tudo', () => {
    expect(acessoGrupo(TODOS, 'cr40f_funcionarios.pessoal')).toEqual({ ler: true, editar: true })
  })
})

describe('acessoColuna', () => {
  it('acha o grupo da coluna; fora de grupo vale tudo', () => {
    expect(acessoColuna(p('rh:operador'), 'cr40f_funcionarios', 'cr40f_numerodocpf')).toEqual({ ler: false, editar: false })
    expect(acessoColuna(p('rh:operador'), 'cr40f_funcionarios', 'cr40f_datadeadmissao')).toEqual({ ler: true, editar: true })
    expect(acessoColuna(p('rh:operador'), 'cr40f_funcionarios', 'cr40f_nomecompleto')).toEqual({ ler: true, editar: true })
    expect(acessoColuna(p('rh:operador'), 'tabela_sem_grupo', 'qualquer')).toEqual({ ler: true, editar: true })
  })
})
