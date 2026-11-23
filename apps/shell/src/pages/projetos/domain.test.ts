import { describe, expect, it } from 'vitest'
import { createMockAtualizacoes, createMockEtapas, createMockProjetos } from './data/mock'
import { atualizacaoPayload, atualizacoesPath, etapaPayload, mapAtualizacao, mapEtapa, projetosPath } from './data/queries'
import { MAX_ANEXO_BYTES, erroDoAnexo } from './domain/anexos'
import { AUTOR, STATUS, autorDoPerfil, statusLabel } from './domain/choices'
import { applyEtapa, diffEtapa, diffProjeto, emptyEtapaForm, emptyProjetoForm, toEtapaForm, validateEtapa, validateProjeto } from './domain/form'
import { acaoPendente, agrupar, contagens, fase, galeriaDeProvas, motivoSemConcluir, parada, precisaDeMim, projetoPrecisaDeMim, quandoCurto, siglaAutor, trilha } from './domain/painel'
import { AVISO_SEM_PROVA, AVISO_SO_RENAN, atrasada, doProjeto, erroDeStatus, etapasDo, ordemDoCodigo, podeConcluir, progresso, proximaEtapa, provas } from './domain/regras'
import type { Atualizacao, Etapa } from './domain/types'

const at = (over: Partial<Atualizacao>): Atualizacao => ({ id: 'a', projetoId: 'p', etapaId: 'e1', data: '2026-11-20T10:00:00', autor: AUTOR.agente, texto: '', prova: false, transcricao: '', anexos: [], ...over })
const et = (over: Partial<Etapa>): Etapa => ({ id: 'e1', projetoId: 'p', numero: 1, codigo: 'PRJ-1.1', nome: 'E', status: STATUS.ideia, descricao: '', prazo: null, andamento: 0, linkPr: '', publicadoProd: null, ...over })
const anexo = { id: 'x', nome: 'print.png', tipo: 'image/png', tamanho: 10 }
const HOJE = '2026-11-23'

describe('regra do Concluída (por etapa)', () => {
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

describe('código e progresso', () => {
  it('próxima etapa: número = maior + 1 e código PRJ-n.m', () => {
    const etapas = createMockEtapas()
    const p1 = createMockProjetos()[0]
    expect(proximaEtapa(p1, etapasDo(etapas, p1.id))).toEqual({ numero: 4, codigo: 'PRJ-1.4' })
    expect(proximaEtapa({ id: 'x', codigo: 'PRJ-9' }, [])).toEqual({ numero: 1, codigo: 'PRJ-9.1' })
    expect(proximaEtapa({ id: 'x', codigo: 'PRJ-9' }, [et({ projetoId: 'x', numero: 7 })])).toMatchObject({ numero: 8, codigo: 'PRJ-9.8' })
    expect(proximaEtapa({ id: 'x', codigo: '' }, []).codigo).toBe('')
  })
  it('projeto sem etapas: "Sem etapas", sem destaque nem prazo', () => {
    const p = progresso([], HOJE)
    expect(p).toMatchObject({ total: 0, concluidas: 0, rotulo: 'Sem etapas', destaque: null, atrasada: false, proximoPrazo: null })
    expect(statusLabel(null)).toBe('Sem etapas')
  })
  it('progresso derivado: concluídas de N, destaque e próximo prazo', () => {
    const etapas = [
      et({ id: 'a', numero: 1, status: STATUS.concluida, prazo: '2026-11-01' }),
      et({ id: 'b', numero: 2, status: STATUS.validacao, prazo: '2026-12-10' }),
      et({ id: 'c', numero: 3, status: STATUS.ideia, prazo: '2026-12-01' }),
    ]
    const p = progresso(etapas, HOJE)
    expect(p).toMatchObject({ total: 3, concluidas: 1, rotulo: '1 de 3 concluídas', atrasada: false, proximoPrazo: '2026-12-01' })
    expect(p.destaque?.id).toBe('b')
    expect(progresso([et({ status: STATUS.concluida })], HOJE).rotulo).toBe('1 de 1 concluída')
  })
  it('atrasada: prazo vencido e etapa aberta; vira o destaque', () => {
    expect(atrasada({ prazo: '2026-11-01', status: STATUS.andamento }, HOJE)).toBe(true)
    expect(atrasada({ prazo: '2026-11-01', status: STATUS.concluida }, HOJE)).toBe(false)
    expect(atrasada({ prazo: '2026-11-01', status: STATUS.pausada }, HOJE)).toBe(false)
    expect(atrasada({ prazo: null, status: STATUS.andamento }, HOJE)).toBe(false)
    const p = progresso([et({ id: 'v', status: STATUS.validacao }), et({ id: 'x', numero: 2, status: STATUS.andamento, prazo: '2026-11-02' })], HOJE)
    expect(p.atrasada).toBe(true)
    expect(p.destaque?.id).toBe('x')
  })
  it('ordem do código é numérica (PRJ-10 depois de PRJ-9)', () => {
    expect(ordemDoCodigo('PRJ-10')).toBeGreaterThan(ordemDoCodigo('PRJ-9') ?? 0)
    expect(ordemDoCodigo('PRJ-2.10')).toBeGreaterThan(ordemDoCodigo('PRJ-2.9') ?? 0)
  })
})

describe('formulários', () => {
  it('projeto exige nome; diff leva só o preenchido', () => {
    expect(validateProjeto(emptyProjetoForm()).nome).toBeTruthy()
    const f = { ...emptyProjetoForm(), nome: ' Novo ', briefing: 'Preciso de X' }
    expect(validateProjeto(f)).toEqual({})
    expect(diffProjeto(null, f)).toEqual({ cr40f_name: 'Novo', cr40f_briefing: 'Preciso de X' })
    expect(diffProjeto(f, { ...f, briefing: '' })).toEqual({ cr40f_briefing: null })
  })
  it('etapa: nome, andamento 0–100, link http(s), data real; nova nasce em Ideia', () => {
    const ctx = { base: null, perfil: 'renan' as const, etapaId: null, atualizacoes: [] }
    const f = { ...emptyEtapaForm(), nome: 'Tela' }
    expect(validateEtapa(emptyEtapaForm(), ctx).nome).toBeTruthy()
    expect(validateEtapa({ ...f, andamento: '101' }, ctx).andamento).toBeTruthy()
    expect(validateEtapa({ ...f, linkPr: 'javascript:alert(1)' }, ctx).linkPr).toBeTruthy()
    expect(validateEtapa({ ...f, prazo: '2026-02-30' }, ctx).prazo).toBeTruthy()
    expect(validateEtapa({ ...f, status: String(STATUS.andamento) }, ctx).status).toBeTruthy()
    expect(validateEtapa(f, ctx)).toEqual({})
    expect(diffEtapa(null, f)).toEqual({ cr40f_name: 'Tela', cr40f_status: STATUS.ideia, cr40f_andamento: 0 })
  })
  it('etapa existente: Concluída sem prova e gestor trocando status viram erro de status', () => {
    const e = et({ status: STATUS.validacao })
    const base = toEtapaForm(e)
    const f = { ...base, status: String(STATUS.concluida) }
    expect(validateEtapa(f, { base, perfil: 'renan', etapaId: e.id, atualizacoes: [] }).status).toBe(AVISO_SEM_PROVA)
    expect(validateEtapa(f, { base, perfil: 'gestor', etapaId: e.id, atualizacoes: [] }).status).toBe(AVISO_SO_RENAN)
    const g = { ...base, andamento: '40', linkPr: '' }
    expect(diffEtapa(base, g)).toEqual({ cr40f_andamento: 40 })
    expect(applyEtapa(e, g)).toMatchObject({ andamento: 40 })
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
    expect(a).toMatchObject({ id: 'id1', projetoId: 'p1', etapaId: 'e1', prova: true, transcricao: 'oi' })
    const e = mapEtapa({ cr40f_projetoetapaid: 'E1', _cr40f_projeto_value: 'P1', cr40f_numero: 2, cr40f_codigo: 'PRJ-1.2', cr40f_name: 'X', cr40f_status: STATUS.validacao, cr40f_andamento: 90 })
    expect(e).toMatchObject({ id: 'e1', projetoId: 'p1', numero: 2, codigo: 'PRJ-1.2', status: STATUS.validacao, andamento: 90 })
    const sets = { projeto: 'cr40f_projetos', etapa: 'cr40f_projetoetapas', atualizacao: 'cr40f_projetoatualizacaos' }
    expect(JSON.stringify(atualizacaoPayload({ projetoId: 'p1', etapaId: 'e1', data: '2026-11-20T10:00:00', autor: AUTOR.renan, texto: 't', prova: true }, sets))).toContain('cr40f_Etapa@odata.bind')
    expect(etapaPayload({ cr40f_name: 'X' }, { projetoId: 'p1', numero: 3, codigo: 'PRJ-1.3' }, sets)).toMatchObject({ cr40f_numero: 3, cr40f_codigo: 'PRJ-1.3' })
  })
})

describe('painel: trilha, filtros e contagens', () => {
  const pj = (over: Partial<{ id: string; codigo: string; nome: string; briefing: string }> = {}) => ({ id: 'p', codigo: 'PRJ-1', nome: 'P', area: '', responsavel: '', briefing: '', instrucoes: '', ...over })
  it('fase: Ideia 1, Em andamento 2, Em validação 3, publicado e aberto 4, Concluída 5, Pausada sem destaque', () => {
    expect(fase(et({ status: STATUS.ideia }))).toBe(1)
    expect(fase(et({ status: STATUS.andamento }))).toBe(2)
    expect(fase(et({ status: STATUS.validacao }))).toBe(3)
    expect(fase(et({ status: STATUS.validacao, publicadoProd: '2026-11-20T18:00:00Z' }))).toBe(4)
    expect(fase(et({ status: STATUS.concluida, publicadoProd: '2026-11-20T18:00:00Z' }))).toBe(5)
    expect(fase(et({ status: STATUS.pausada, publicadoProd: '2026-11-20T18:00:00Z' }))).toBeNull()
  })
  it('trilha: rótulo curto, vencido e descrição para leitor de tela', () => {
    expect(trilha(et({ status: STATUS.andamento, andamento: 40 }), [], HOJE)).toMatchObject({ fase: 2, rotulo: '40%', tom: 'fazendo' })
    expect(trilha(et({ status: STATUS.validacao }), [], HOJE).descricao).toBe('PRJ-1.1: fase 3 de 5, DEV (Conferir)')
    const vencida = trilha(et({ status: STATUS.andamento, prazo: '2026-11-20' }), [], HOJE)
    expect(vencida).toMatchObject({ rotulo: 'Vencido', tom: 'vencido' })
    expect(vencida.descricao).toContain('prazo vencido')
    expect(trilha(et({ status: STATUS.pausada }), [], HOJE)).toMatchObject({ fase: null })
  })
  it('ação pendente: Conferir, Anexar prova, Concluir e Montar brief', () => {
    const prova = at({ prova: true, anexos: [anexo] })
    expect(acaoPendente(et({ status: STATUS.validacao }), [])).toBe('Conferir')
    expect(acaoPendente(et({ status: STATUS.andamento, publicadoProd: '2026-11-20T18:00:00Z' }), [])).toBe('Anexar prova')
    expect(acaoPendente(et({ status: STATUS.andamento, publicadoProd: '2026-11-20T18:00:00Z' }), [prova])).toBe('Concluir')
    expect(acaoPendente(et({ status: STATUS.ideia }), [at({ texto: 'brief' })])).toBe('Montar brief')
    expect(acaoPendente(et({ status: STATUS.ideia }), [])).toBeNull()
    expect(acaoPendente(et({ status: STATUS.concluida }), [prova])).toBeNull()
  })
  it('parada: etapa aberta sem atualização há mais de 7 dias', () => {
    const velha = at({ data: '2026-11-12T10:00:00' })
    expect(parada(et({ status: STATUS.andamento }), [velha], HOJE)).toBe(true)
    expect(parada(et({ status: STATUS.andamento }), [at({ data: '2026-11-20T10:00:00' })], HOJE)).toBe(false)
    expect(parada(et({ status: STATUS.concluida }), [velha], HOJE)).toBe(false)
    expect(parada(et({ status: STATUS.pausada }), [velha], HOJE)).toBe(false)
    expect(parada(et({ status: STATUS.andamento }), [], HOJE)).toBe(false)
  })
  it('precisa de mim (Renan): em validação, publicado sem prova ou briefing sem etapas; gestor nunca', () => {
    expect(precisaDeMim('renan', et({ status: STATUS.validacao }), [])).toBe(true)
    expect(precisaDeMim('renan', et({ status: STATUS.andamento, publicadoProd: '2026-11-20T18:00:00Z' }), [])).toBe(true)
    expect(precisaDeMim('renan', et({ status: STATUS.andamento, publicadoProd: '2026-11-20T18:00:00Z' }), [at({ prova: true, anexos: [anexo] })])).toBe(false)
    expect(precisaDeMim('renan', et({ status: STATUS.andamento }), [])).toBe(false)
    expect(precisaDeMim('gestor', et({ status: STATUS.validacao }), [])).toBe(false)
    expect(projetoPrecisaDeMim('renan', pj({ briefing: 'Pedido' }), [], [])).toBe(true)
    expect(projetoPrecisaDeMim('renan', pj(), [], [])).toBe(false)
    expect(projetoPrecisaDeMim('renan', pj({ briefing: 'Pedido' }), [et({})], [])).toBe(false)
  })
  it('contagens e agrupamento batem com os filtros, a busca ignora acento', () => {
    const projetos = [pj({ id: 'p', codigo: 'PRJ-1', nome: 'Gestão' }), pj({ id: 'q', codigo: 'PRJ-2', nome: 'Novo', briefing: 'Pedido do gestor' })]
    const etapas = [
      et({ id: 'e1', codigo: 'PRJ-1.1', status: STATUS.validacao }),
      et({ id: 'e2', codigo: 'PRJ-1.2', numero: 2, status: STATUS.andamento }),
      et({ id: 'e3', codigo: 'PRJ-1.3', numero: 3, status: STATUS.concluida }),
    ]
    const atualizacoes = [at({ etapaId: 'e2', data: '2026-11-10T10:00:00' }), at({ id: 'b', etapaId: 'e3', prova: true, anexos: [anexo] })]
    const ctx = { projetos, etapas, atualizacoes, perfil: 'renan' as const, hoje: HOJE }
    expect(contagens(ctx)).toEqual({ todos: 4, mim: 2, validacao: 1, parados: 1, provas: 1 })
    expect(agrupar({ ...ctx, filtro: 'validacao', busca: '' }).map((g) => [g.projeto.codigo, g.etapas.map((e) => e.codigo)])).toEqual([['PRJ-1', ['PRJ-1.1']]])
    expect(agrupar({ ...ctx, filtro: 'mim', busca: '' }).map((g) => g.projeto.codigo)).toEqual(['PRJ-1', 'PRJ-2'])
    const g1 = agrupar({ ...ctx, filtro: 'todos', busca: 'gestao' })
    expect(g1.map((g) => g.projeto.codigo)).toEqual(['PRJ-1'])
    expect(g1[0]).toMatchObject({ total: 3, concluidas: 1 })
    expect(agrupar({ ...ctx, filtro: 'todos', busca: 'PRJ-1.2' })[0].etapas.map((e) => e.codigo)).toEqual(['PRJ-1.2'])
    expect(agrupar({ ...ctx, filtro: 'todos', busca: '' }).find((g) => g.projeto.codigo === 'PRJ-2')?.acao).toBe('Montar brief')
    const gestor = contagens({ ...ctx, perfil: 'gestor' })
    expect(gestor.mim).toBe(0)
  })
  it('galeria de provas por projeto e tipo; motivo de não concluir', () => {
    const d = { projetos: createMockProjetos(), etapas: createMockEtapas(), atualizacoes: createMockAtualizacoes() }
    const todas = galeriaDeProvas(d)
    expect(todas.length).toBeGreaterThan(0)
    expect(todas.every((i) => i.atualizacao.prova)).toBe(true)
    expect(galeriaDeProvas(d, { tipo: 'video' }).every((i) => i.anexo.tipo.startsWith('video/'))).toBe(true)
    const pid = todas[0].projeto?.id ?? ''
    expect(galeriaDeProvas(d, { projetoId: pid }).every((i) => i.atualizacao.projetoId === pid)).toBe(true)
    expect(motivoSemConcluir('gestor', et({}), [])).toBe('só o Renan')
    expect(motivoSemConcluir('renan', et({}), [])).toBe('falta prova')
    expect(motivoSemConcluir('renan', et({}), [at({ prova: true, anexos: [anexo] })])).toBeNull()
    expect(motivoSemConcluir('renan', et({ status: STATUS.concluida }), [])).toBe('já concluída')
  })
  it('quando curto e sigla do autor', () => {
    expect(quandoCurto('2026-11-23T14:05:00', HOJE)).toBe('hoje 14:05')
    expect(quandoCurto('2026-11-22T09:00:00', HOJE)).toBe('ontem')
    expect(quandoCurto('2026-11-02T09:00:00', HOJE)).toBe('02/11')
    expect([siglaAutor(AUTOR.renan), siglaAutor(AUTOR.gestor), siglaAutor(AUTOR.agente)]).toEqual(['R', 'G', 'IA'])
  })
})
