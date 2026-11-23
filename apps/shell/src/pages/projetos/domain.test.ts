import { describe, expect, it } from 'vitest'
import { createMockAtualizacoes, createMockEtapas, createMockProjetos } from './data/mock'
import { atualizacaoPayload, atualizacoesPath, etapaPayload, mapAtualizacao, mapEtapa, projetosPath } from './data/queries'
import { MAX_ANEXO_BYTES, erroDoAnexo } from './domain/anexos'
import { AUTOR, STATUS, autorDoPerfil, statusLabel } from './domain/choices'
import { applyEtapa, applyProjeto, diffEtapa, diffProjeto, emptyProjetoForm, toProjetoForm, validateProjeto } from './domain/form'
import { acaoPendente, contagens, fase, linhas, motivoSemConcluir, oQueFalta, parada, precisaDeMim, siglaAutor, situacao, trilha } from './domain/painel'
import { AVISO_SEM_PROVA, AVISO_SO_RENAN, atrasada, codigoEtapa1, doProjeto, erroDeStatus, etapaDoProjeto, ordemDoCodigo, podeConcluir, provas } from './domain/regras'
import type { Atualizacao, Etapa } from './domain/types'

const at = (over: Partial<Atualizacao>): Atualizacao => ({ id: 'a', projetoId: 'p', etapaId: 'e1', data: '2026-11-20T10:00:00', autor: AUTOR.agente, texto: '', prova: false, transcricao: '', anexos: [], ...over })
const et = (over: Partial<Etapa>): Etapa => ({ id: 'e1', projetoId: 'p', numero: 1, codigo: 'PRJ-1.1', nome: 'E', status: STATUS.ideia, prazo: null, andamento: 0, linkPr: '', publicadoProd: null, ...over })
const anexo = { id: 'x', nome: 'print.png', tipo: 'image/png', tamanho: 10 }
const HOJE = '2026-11-23'

describe('regra do Pronto (prova da própria etapa)', () => {
  const concluir = (perfil: 'renan' | 'gestor', atualizacoes: Atualizacao[]) =>
    erroDeStatus({ novo: STATUS.concluida, atual: STATUS.validacao, perfil, etapaId: 'e1', atualizacoes })
  it('sem prova da etapa não conclui', () => {
    expect(podeConcluir([], 'e1')).toBe(false)
    expect(concluir('renan', [])).toBe(AVISO_SEM_PROVA)
  })
  it('prova sem anexo, anexo sem marca e prova de outra etapa não contam', () => {
    expect(podeConcluir([at({ prova: true })], 'e1')).toBe(false)
    expect(podeConcluir([at({ anexos: [anexo] })], 'e1')).toBe(false)
    expect(concluir('renan', [at({ etapaId: 'e2', prova: true, anexos: [anexo] })])).toBe(AVISO_SEM_PROVA)
    expect(concluir('renan', [at({ etapaId: null, prova: true, anexos: [anexo] })])).toBe(AVISO_SEM_PROVA)
  })
  it('prova com anexo na própria etapa libera o Renan', () => {
    const lista = [at({ prova: true, anexos: [anexo] })]
    expect(provas(lista)).toHaveLength(1)
    expect(concluir('renan', lista)).toBeNull()
  })
  it('gestor não muda status (nem com prova); manter o mesmo status é livre', () => {
    expect(concluir('gestor', [at({ prova: true, anexos: [anexo] })])).toBe(AVISO_SO_RENAN)
    expect(erroDeStatus({ novo: STATUS.andamento, atual: STATUS.ideia, perfil: 'gestor', etapaId: 'e1', atualizacoes: [] })).toBe(AVISO_SO_RENAN)
    expect(erroDeStatus({ novo: STATUS.ideia, atual: STATUS.ideia, perfil: 'gestor', etapaId: 'e1', atualizacoes: [] })).toBeNull()
  })
})

describe('etapa única do projeto', () => {
  it('usa a de menor número e ignora as outras; sem etapa = null', () => {
    const etapas = [et({ id: 'b', numero: 2 }), et({ id: 'a', numero: 1 }), et({ id: 'z', projetoId: 'outro' })]
    expect(etapaDoProjeto(etapas, 'p')?.id).toBe('a')
    expect(etapaDoProjeto([], 'p')).toBeNull()
    expect(etapaDoProjeto(createMockEtapas(), createMockProjetos()[3].id)).toBeNull()
  })
  it('código da etapa é <código do projeto>.1', () => {
    expect(codigoEtapa1('PRJ-9')).toBe('PRJ-9.1')
    expect(codigoEtapa1('')).toBe('')
  })
  it('atrasada: prazo vencido e etapa aberta', () => {
    expect(atrasada({ prazo: '2026-11-01', status: STATUS.andamento }, HOJE)).toBe(true)
    expect(atrasada({ prazo: '2026-11-01', status: STATUS.concluida }, HOJE)).toBe(false)
    expect(atrasada({ prazo: '2026-11-01', status: STATUS.pausada }, HOJE)).toBe(false)
    expect(atrasada({ prazo: null, status: STATUS.andamento }, HOJE)).toBe(false)
  })
  it('ordem do código é numérica (PRJ-10 depois de PRJ-9)', () => {
    expect(ordemDoCodigo('PRJ-10')).toBeGreaterThan(ordemDoCodigo('PRJ-9') ?? 0)
  })
  it('situação: rótulos curtos, "Pronto · N provas" e "No PROD"', () => {
    expect(statusLabel(null)).toBe('Ideia')
    expect(situacao(null, [])).toMatchObject({ rotulo: 'Ideia' })
    expect(situacao(et({ status: STATUS.validacao }), []).rotulo).toBe('Conferir')
    expect(situacao(et({ status: STATUS.andamento, publicadoProd: '2026-11-20T18:00:00Z' }), []).rotulo).toBe('No PROD')
    expect(situacao(et({ status: STATUS.concluida }), [at({ prova: true, anexos: [anexo, anexo] })]).rotulo).toBe('Pronto · 2 provas')
    expect(situacao(et({ status: STATUS.concluida }), [at({ prova: true, anexos: [anexo] })]).rotulo).toBe('Pronto · 1 prova')
  })
})

describe('formulário do projeto', () => {
  const ctxNovo = { base: null, perfil: 'renan' as const, etapa: null, atualizacoes: [] }
  it('exige nome; diff do projeto e da etapa levam só o preenchido (status Ideia no cadastro)', () => {
    expect(validateProjeto(emptyProjetoForm(), ctxNovo).nome).toBeTruthy()
    const f = { ...emptyProjetoForm(), nome: ' Novo ', briefing: 'Preciso de X', falta: ' Definir o texto ' }
    expect(validateProjeto(f, ctxNovo)).toEqual({})
    expect(diffProjeto(null, f)).toEqual({ cr40f_name: 'Novo', cr40f_briefing: 'Preciso de X' })
    expect(diffEtapa(null, f)).toEqual({ cr40f_name: 'Definir o texto', cr40f_status: STATUS.ideia })
    expect(diffProjeto(f, { ...f, briefing: '' })).toEqual({ cr40f_briefing: null })
    expect(diffEtapa(f, { ...f, falta: '', prazo: '2026-12-01' })).toEqual({ cr40f_name: null, cr40f_prazo: '2026-12-01' })
  })
  it('prazo precisa ser uma data real', () => {
    expect(validateProjeto({ ...emptyProjetoForm(), nome: 'A', prazo: '2026-02-30' }, ctxNovo).prazo).toBeTruthy()
  })
  it('com etapa: Pronto sem prova e gestor trocando situação viram erro de status', () => {
    const e = et({ status: STATUS.validacao })
    const base = toProjetoForm({ id: 'p', codigo: 'PRJ-1', nome: 'P', area: '', responsavel: '', briefing: '', instrucoes: '' }, e)
    const f = { ...base, status: String(STATUS.concluida) }
    expect(validateProjeto(f, { base, perfil: 'renan', etapa: e, atualizacoes: [] }).status).toBe(AVISO_SEM_PROVA)
    expect(validateProjeto(f, { base, perfil: 'gestor', etapa: e, atualizacoes: [] }).status).toBe(AVISO_SO_RENAN)
    expect(validateProjeto(f, { base, perfil: 'renan', etapa: e, atualizacoes: [at({ prova: true, anexos: [anexo] })] }).status).toBeUndefined()
    const g = { ...base, falta: 'Revisar' }
    expect(diffEtapa(base, g)).toEqual({ cr40f_name: 'Revisar' })
    expect(applyEtapa(e, g)).toMatchObject({ nome: 'Revisar' })
    expect(applyProjeto({ id: 'p', codigo: 'PRJ-1', nome: 'P', area: '', responsavel: '', briefing: '', instrucoes: '' }, { ...base, nome: ' Q ' }).nome).toBe('Q')
  })
  it('sem etapa ainda: mudar a situação é só do Renan e Pronto não vale', () => {
    const base = emptyProjetoForm()
    const andando = { ...base, nome: 'A', status: String(STATUS.andamento) }
    expect(validateProjeto(andando, { base, perfil: 'gestor', etapa: null, atualizacoes: [] }).status).toBe(AVISO_SO_RENAN)
    expect(validateProjeto(andando, { base, perfil: 'renan', etapa: null, atualizacoes: [] }).status).toBeUndefined()
    expect(validateProjeto({ ...andando, status: String(STATUS.concluida) }, { base, perfil: 'renan', etapa: null, atualizacoes: [] }).status).toBe(AVISO_SEM_PROVA)
  })
})

describe('anexos', () => {
  it('aceita imagem, vídeo, áudio e PDF; recusa o resto, o grande e o vazio', () => {
    expect(erroDoAnexo({ name: 'a.png', type: 'image/png', size: 100 })).toBeNull()
    expect(erroDoAnexo({ name: 'a.mp4', type: 'video/mp4', size: 100 })).toBeNull()
    expect(erroDoAnexo({ name: 'a.webm', type: 'audio/webm', size: 100 })).toBeNull()
    expect(erroDoAnexo({ name: 'a.pdf', type: 'application/pdf', size: 100 })).toBeNull()
    expect(erroDoAnexo({ name: 'a.exe', type: 'application/x-msdownload', size: 100 })).toMatch(/só imagem/)
    expect(erroDoAnexo({ name: 'g.png', type: 'image/png', size: MAX_ANEXO_BYTES + 1 })).toMatch(/limite de 5 MB/)
    expect(erroDoAnexo({ name: 'v.png', type: 'image/png', size: 0 })).toMatch(/vazio/)
  })
  it('autor vem do perfil', () => {
    expect(autorDoPerfil('renan')).toBe(AUTOR.renan)
    expect(autorDoPerfil('gestor')).toBe(AUTOR.gestor)
  })
})

describe('lista e dados', () => {
  it('linha do tempo vem da mais recente para a mais antiga', () => {
    const itens = doProjeto(createMockAtualizacoes(), createMockProjetos()[0].id)
    expect(itens.map((a) => a.data)).toEqual([...itens.map((a) => a.data)].sort().reverse())
  })
  it('consultas, payloads e mapeamento do Dataverse', () => {
    expect(projetosPath('cr40f_projetos')).toContain('cr40f_briefing')
    const path = atualizacoesPath('cr40f_projetoatualizacaos')
    expect(path).toContain('_cr40f_etapa_value')
    expect(path).toContain('cr40f_transcricao')
    const a = mapAtualizacao({ cr40f_projetoatualizacaoid: 'ID1', _cr40f_projeto_value: 'P1', _cr40f_etapa_value: 'E1', cr40f_data: '2026-11-20T10:00:00Z', cr40f_autor: AUTOR.agente, cr40f_texto: 't', cr40f_eprova: true, cr40f_transcricao: 'oi', cr40f_projetoatualizacao_Annotations: [{ annotationid: 'N1', filename: 'a.webm', mimetype: 'audio/webm', filesize: 5 }] })
    expect(a).toMatchObject({ id: 'id1', projetoId: 'p1', etapaId: 'e1', data: '2026-11-20T07:00:00', prova: true, transcricao: 'oi' })
    const e = mapEtapa({ cr40f_projetoetapaid: 'E1', _cr40f_projeto_value: 'P1', cr40f_numero: 2, cr40f_codigo: 'PRJ-1.2', cr40f_name: 'X', cr40f_status: STATUS.validacao, cr40f_andamento: 90 })
    expect(e).toMatchObject({ id: 'e1', projetoId: 'p1', numero: 2, codigo: 'PRJ-1.2', status: STATUS.validacao, andamento: 90 })
    const sets = { projeto: 'cr40f_projetos', etapa: 'cr40f_projetoetapas', atualizacao: 'cr40f_projetoatualizacaos' }
    expect(JSON.stringify(atualizacaoPayload({ projetoId: 'p1', etapaId: 'e1', data: '2026-11-20T10:00:00', autor: AUTOR.renan, texto: 't', prova: true }, sets))).toContain('cr40f_Etapa@odata.bind')
    expect(etapaPayload({ cr40f_name: 'X' }, { projetoId: 'p1', numero: 3, codigo: 'PRJ-1.3' }, sets)).toMatchObject({ cr40f_numero: 3, cr40f_codigo: 'PRJ-1.3' })
  })
})

describe('painel: trilha, filtros e linhas', () => {
  const pj = (over: Partial<{ id: string; codigo: string; nome: string; briefing: string }> = {}) => ({ id: 'p', codigo: 'PRJ-1', nome: 'P', area: '', responsavel: '', briefing: '', instrucoes: '', ...over })
  it('fase: Ideia 1, Fazendo 2, Conferir 3, publicado e aberto 4, Pronto 5, Pausado sem destaque', () => {
    expect(fase(et({ status: STATUS.ideia }))).toBe(1)
    expect(fase(et({ status: STATUS.andamento }))).toBe(2)
    expect(fase(et({ status: STATUS.validacao }))).toBe(3)
    expect(fase(et({ status: STATUS.validacao, publicadoProd: '2026-11-20T18:00:00Z' }))).toBe(4)
    expect(fase(et({ status: STATUS.concluida, publicadoProd: '2026-11-20T18:00:00Z' }))).toBe(5)
    expect(fase(et({ status: STATUS.pausada, publicadoProd: '2026-11-20T18:00:00Z' }))).toBeNull()
  })
  it('trilha: rótulo curto, vencido e descrição para leitor de tela (sem código de etapa)', () => {
    expect(trilha(et({ status: STATUS.andamento, andamento: 40 }), [], HOJE)).toMatchObject({ fase: 2, rotulo: '40%', tom: 'fazendo' })
    expect(trilha(et({ status: STATUS.validacao }), [], HOJE).descricao).toBe('Fase 3 de 5, DEV (Conferir)')
    const vencida = trilha(et({ status: STATUS.andamento, prazo: '2026-11-20' }), [], HOJE)
    expect(vencida).toMatchObject({ rotulo: 'Vencido', tom: 'vencido' })
    expect(vencida.descricao).toContain('prazo vencido')
    expect(trilha(et({ status: STATUS.pausada }), [], HOJE)).toMatchObject({ fase: null })
  })
  it('ação pendente: Conferir, Anexar prova e Concluir', () => {
    const prova = at({ prova: true, anexos: [anexo] })
    expect(acaoPendente(et({ status: STATUS.validacao }), [])).toBe('Conferir')
    expect(acaoPendente(et({ status: STATUS.andamento, publicadoProd: '2026-11-20T18:00:00Z' }), [])).toBe('Anexar prova')
    expect(acaoPendente(et({ status: STATUS.andamento, publicadoProd: '2026-11-20T18:00:00Z' }), [prova])).toBe('Concluir')
    expect(acaoPendente(et({ status: STATUS.ideia }), [])).toBeNull()
    expect(acaoPendente(et({ status: STATUS.concluida }), [prova])).toBeNull()
  })
  it('parada: aberta sem atualização há mais de 7 dias', () => {
    const velha = at({ data: '2026-11-12T10:00:00' })
    expect(parada(et({ status: STATUS.andamento }), [velha], HOJE)).toBe(true)
    expect(parada(et({ status: STATUS.andamento }), [at({ data: '2026-11-20T10:00:00' })], HOJE)).toBe(false)
    expect(parada(et({ status: STATUS.concluida }), [velha], HOJE)).toBe(false)
    expect(parada(et({ status: STATUS.pausada }), [velha], HOJE)).toBe(false)
    expect(parada(et({ status: STATUS.andamento }), [], HOJE)).toBe(false)
  })
  it('precisa de mim (Renan): conferir, publicado sem prova ou briefing sem etapa; gestor nunca', () => {
    const prod = { status: STATUS.andamento, publicadoProd: '2026-11-20T18:00:00Z' }
    expect(precisaDeMim('renan', pj(), et({ status: STATUS.validacao }), [])).toBe(true)
    expect(precisaDeMim('renan', pj(), et(prod), [])).toBe(true)
    expect(precisaDeMim('renan', pj(), et(prod), [at({ prova: true, anexos: [anexo] })])).toBe(false)
    expect(precisaDeMim('renan', pj(), et({ status: STATUS.andamento }), [])).toBe(false)
    expect(precisaDeMim('gestor', pj(), et({ status: STATUS.validacao }), [])).toBe(false)
    expect(precisaDeMim('renan', pj({ briefing: 'Pedido' }), null, [])).toBe(true)
    expect(precisaDeMim('renan', pj(), null, [])).toBe(false)
    expect(precisaDeMim('renan', pj({ briefing: 'Pedido' }), et({}), [])).toBe(false)
  })
  it('"o que falta": nome da etapa, senão a ação pendente, senão o brief a montar', () => {
    expect(oQueFalta(pj(), et({ nome: 'Definir texto' }), [])).toBe('Definir texto')
    expect(oQueFalta(pj(), et({ nome: '', status: STATUS.validacao }), [])).toBe('Conferir')
    expect(oQueFalta(pj({ briefing: 'x' }), null, [])).toBe('Montar o brief')
    expect(oQueFalta(pj(), null, [])).toBe('—')
  })
  it('contagens e linhas (uma por projeto) batem com os filtros; a busca ignora acento', () => {
    const projetos = [pj({ id: 'p', codigo: 'PRJ-1', nome: 'Gestão' }), pj({ id: 'q', codigo: 'PRJ-2', nome: 'Novo', briefing: 'Pedido do gestor' }), pj({ id: 'r', codigo: 'PRJ-3', nome: 'Pronto' })]
    const etapas = [
      et({ id: 'e1', projetoId: 'p', status: STATUS.validacao, nome: 'Conferir tela' }),
      et({ id: 'e2', projetoId: 'p', numero: 2, status: STATUS.andamento, nome: 'ignorada' }),
      et({ id: 'e3', projetoId: 'r', status: STATUS.concluida }),
    ]
    const atualizacoes = [at({ etapaId: 'e1', projetoId: 'p', data: '2026-11-10T10:00:00' }), at({ id: 'b', etapaId: 'e3', projetoId: 'r', prova: true, anexos: [anexo] })]
    const ctx = { projetos, etapas, atualizacoes, perfil: 'renan' as const, hoje: HOJE }
    expect(contagens(ctx)).toEqual({ todos: 3, mim: 2, validacao: 1, parados: 1, provas: 1 })
    expect(linhas({ ...ctx, filtro: 'todos', busca: '' }).map((l) => l.projeto.codigo)).toEqual(['PRJ-1', 'PRJ-2', 'PRJ-3'])
    expect(linhas({ ...ctx, filtro: 'validacao', busca: '' }).map((l) => [l.projeto.codigo, l.falta, l.situacao.rotulo])).toEqual([['PRJ-1', 'Conferir tela', 'Conferir']])
    expect(linhas({ ...ctx, filtro: 'mim', busca: '' }).map((l) => l.projeto.codigo)).toEqual(['PRJ-1', 'PRJ-2'])
    expect(linhas({ ...ctx, filtro: 'todos', busca: 'gestao' }).map((l) => l.projeto.codigo)).toEqual(['PRJ-1'])
    expect(linhas({ ...ctx, filtro: 'todos', busca: 'conferir tela' }).map((l) => l.projeto.codigo)).toEqual(['PRJ-1'])
    expect(linhas({ ...ctx, filtro: 'todos', busca: '' }).find((l) => l.projeto.codigo === 'PRJ-2')?.falta).toBe('Montar o brief')
    expect(contagens({ ...ctx, perfil: 'gestor' }).mim).toBe(0)
  })
  it('motivo de não concluir e sigla do autor', () => {
    expect(motivoSemConcluir('gestor', et({}), [])).toBe('só o Renan')
    expect(motivoSemConcluir('renan', et({}), [])).toBe('falta prova')
    expect(motivoSemConcluir('renan', et({}), [at({ prova: true, anexos: [anexo] })])).toBeNull()
    expect(motivoSemConcluir('renan', et({ status: STATUS.concluida }), [])).toBe('já pronto')
    expect([siglaAutor(AUTOR.renan), siglaAutor(AUTOR.gestor), siglaAutor(AUTOR.agente)]).toEqual(['R', 'G', 'IA'])
  })
})
