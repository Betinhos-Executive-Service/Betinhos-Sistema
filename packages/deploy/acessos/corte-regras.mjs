// Regras puras do corte dos acessos (plano 4 dos acessos por perfil). Sem rede: corte-estado.mjs lê o Dataverse e
// entrega o estado; relatorio-corte.mjs e corte.mjs só combinam estas funções. Nada aqui imprime id ou nome de pessoa.
import { readFileSync } from 'node:fs'
import { hashCurto } from './dv.mjs'

export const AMBIENTES = ['dev', 'prod']
export const MODOS = ['esperar', 'preparar', 'cortar', 'desfazer']
export const EQUIPE = 'Team-Betinhos-MDA'
export const PAPEL_BASE = 'Perfil - Base'
// Saem da equipe e de quem os tem direto. Os papéis em si nunca mudam (estão na BetinhosCore).
export const PAPEIS_ANTIGOS = ['Acesso-Betinhos-MDA', 'DEV - Usuário']
export const ADMIN = ['Administrador do Sistema', 'System Administrator']
export const DIAS = 90
export const NIVEL = { Basic: 1, Local: 2, Deep: 4, Global: 8 }
export const ESCRITA = ['Create', 'Write']
// Administrativa não perde nenhum destes, usado ou não (fase 2); Delete, Assign e Share só informam.
export const ESSENCIAIS = ['Read', 'Create', 'Write', 'Append', 'AppendTo']
export const SECUNDARIOS = ['Delete', 'Assign', 'Share']
export const PERFIL_AUTOMACAO = 'Passageiros - automação'
export const PAPEL_PROJETOS = 'Projetos'
const GERADO = JSON.parse(readFileSync(new URL('./perfis.gerado.json', import.meta.url), 'utf8'))
// Os 4 Gestores (papel e perfil de coluna de mesmo nome), lidos do gerado: nada de nome escrito à mão.
export const GESTORES = Object.keys(GERADO.papeis).filter((n) => n.endsWith(' - Gestor')).sort()
export const COLUNAS_GESTOR = GESTORES.filter((n) => n in GERADO.colunas)
export const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

export function lerCorte(texto, ambiente) {
  if (!AMBIENTES.includes(ambiente)) throw new Error(`ambiente desconhecido: ${ambiente}`)
  let json
  try {
    json = JSON.parse(String(texto).replace(/^﻿/, ''))
  } catch {
    throw new Error('corte.json não é JSON válido')
  }
  const extras = Object.keys(json).filter((k) => !AMBIENTES.includes(k))
  if (extras.length) throw new Error(`corte.json: chave desconhecida ${extras.join(', ')}`)
  const modo = json[ambiente]
  if (!MODOS.includes(modo)) throw new Error(`corte.json: ${ambiente} precisa ser ${MODOS.join(' | ')}`)
  return modo
}

export function lerIds(texto) {
  const ids = String(texto ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
  const ruins = ids.filter((id) => !GUID.test(id))
  if (ruins.length) throw new Error(`${ruins.length} id(s) fora do formato GUID na variável`)
  return [...new Set(ids)]
}

export function desde(hoje, dias = DIAS) {
  const meiaNoite = Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate())
  return new Date(meiaNoite - dias * 86_400_000).toISOString().replace('.000Z', 'Z')
}

const nivelDe = (ef, tabela, tipo) => (ef.admin ? NIVEL.Global : ef.privs.get(`${tabela}|${tipo}`) ?? 0)

export function papeisDe(estado, pessoa) {
  const ids = [...pessoa.diretos, ...pessoa.equipes.flatMap((t) => estado.equipes.get(t) ?? [])]
  return ids.map((id) => estado.papeis.get(id)).filter(Boolean)
}

// Pessoa administrativa: membro da equipe do corte ou com Administrador do Sistema direto (fora app e a conta que roda).
export function administrativos(estado) {
  // accessmode 0 (leitura-gravação): conta não interativa, só leitura ou stub não é administrativa.
  return estado.pessoas.filter((p) => !p.app && !p.modo && p.id !== estado.servico &&
    ((estado.equipe && p.equipes.includes(estado.equipe.id)) || p.diretos.some((r) => estado.papeis.get(r)?.admin)))
}

// Fase 1: só adiciona. Cada administrativa recebe direto, no papel da unidade dela, o que ainda não tiver (por nome,
// então a cópia de um papel na unidade Frota conta): os 4 Gestores, Projetos, a Base (se não vier da equipe) e os
// perfis de coluna dos Gestores.
export function planoDoPreparo(estado) {
  const papeis = [], colunas = [], erros = []
  const porNome = new Map([...estado.papeis.values()].map((r) => [`${r.nome}|${r.bu}`, r]))
  const perfis = COLUNAS_GESTOR.map((nome) => estado.colunas.perfis.get(nome))
  COLUNAS_GESTOR.forEach((nome, i) => { if (!perfis[i]) erros.push({ motivo: `perfil de coluna ${nome} ausente` }) })
  for (const p of administrativos(estado)) {
    // Conta só o que fica depois do corte: a equipe do corte guarda apenas a Base, então Gestor ou Projetos que vêm dela
    // não valem como "já tem".
    const ficam = [...p.diretos, ...p.equipes.flatMap((t) => (estado.equipes.get(t) ?? []).filter((r) => t !== estado.equipe?.id || r === estado.base))]
    const tem = new Set(ficam.map((id) => estado.papeis.get(id)?.nome).filter(Boolean))
    for (const nome of [PAPEL_BASE, ...GESTORES, PAPEL_PROJETOS]) {
      if (tem.has(nome)) continue
      const papel = porNome.get(`${nome}|${p.bu}`)
      if (papel) papeis.push({ usuario: p.id, papel: papel.id })
      else erros.push({ id: p.id, motivo: `papel ${nome} ausente na unidade da pessoa` })
    }
    for (const perfil of perfis) {
      if (perfil && !estado.colunas.deUsuario.get(p.id)?.has(perfil)) colunas.push({ usuario: p.id, perfil })
    }
  }
  return { papeis, colunas, erros }
}

export const preparoVazio = (p) => !p.papeis.length && !p.colunas.length

export function resumoDoPreparo(plano, { ambiente, sal, total }) {
  const pessoas = new Set([...plano.papeis, ...plano.colunas].map((x) => x.usuario)).size
  return [
    `Preparo dos acessos (${ambiente}): ${plano.erros.length ? 'TRAVADO, nada aplicado' : 'pode aplicar'}`,
    `Plano: ${total} pessoa(s) administrativa(s); ${pessoas} recebem ${plano.papeis.length} papel(is) e ${plano.colunas.length} perfil(is) de coluna; nada sai`,
    ...plano.erros.map((e) => `Erro: ${e.id ? `${hashCurto(e.id, sal)}: ` : ''}${e.motivo}`),
  ].join('\n')
}

export function efetivos(papeis) {
  const r = { admin: false, privs: new Map() }
  for (const p of papeis) {
    if (p.admin) r.admin = true
    for (const { tabela, tipo, nivel } of p.privilegios ?? []) {
      const k = `${tabela}|${tipo}`
      if ((r.privs.get(k) ?? 0) < nivel) r.privs.set(k, nivel)
    }
  }
  return r
}

export function perdas(antes, depois, universo) {
  const escrita = [], leitura = []
  for (const t of universo) {
    if (ESCRITA.some((tipo) => nivelDe(depois, t, tipo) < nivelDe(antes, t, tipo))) escrita.push(t)
    else if (nivelDe(depois, t, 'Read') < nivelDe(antes, t, 'Read')) leitura.push(t)
  }
  return { escrita, leitura }
}

const perdeEm = (antes, depois, t, tipos) => tipos.some((tipo) => nivelDe(depois, t, tipo) < nivelDe(antes, t, tipo))

// A equipe fica só com a Base. Saem os papéis antigos diretos de todos e o admin direto de quem não está em manter.
// Usuário de aplicação e a conta que roda nunca perdem papel direto.
export function planoDoCorte(estado, { manter }) {
  const nome = (id) => estado.papeis.get(id)?.nome ?? ''
  const daEquipe = estado.equipe ? estado.equipes.get(estado.equipe.id) ?? [] : null
  const pessoasRemover = []
  for (const p of estado.pessoas) {
    if (p.app || p.id === estado.servico) continue
    for (const r of p.diretos) {
      if (PAPEIS_ANTIGOS.includes(nome(r)) || (ADMIN.includes(nome(r)) && !manter.has(p.id))) pessoasRemover.push({ usuario: p.id, papel: r })
    }
  }
  return {
    equipeRemover: daEquipe ? daEquipe.filter((r) => r !== estado.base) : [],
    equipeAdicionar: !daEquipe || daEquipe.includes(estado.base) ? [] : [estado.base],
    pessoasRemover,
  }
}

export const planoVazio = (p) => !p.equipeRemover.length && !p.equipeAdicionar.length && !p.pessoasRemover.length

export function aplicarPlano(estado, plano) {
  const equipes = new Map(estado.equipes)
  if (estado.equipe) {
    const atuais = new Set(equipes.get(estado.equipe.id) ?? [])
    for (const r of plano.equipeRemover) atuais.delete(r)
    for (const r of plano.equipeAdicionar) atuais.add(r)
    equipes.set(estado.equipe.id, [...atuais])
  }
  const tirar = new Map()
  for (const { usuario, papel } of plano.pessoasRemover) tirar.set(usuario, new Set([...(tirar.get(usuario) ?? []), papel]))
  const pessoas = estado.pessoas.map((p) => ({ ...p, diretos: p.diretos.filter((r) => !tirar.get(p.id)?.has(r)) }))
  return { ...estado, equipes, pessoas }
}

const SO_LEITURA_INFORMA = [...ESSENCIAIS.filter((t) => t !== 'Read'), ...SECUNDARIOS]
const TUDO = [...ESSENCIAIS, ...SECUNDARIOS]
// Tabelas padrão que o corte mede além das cr40f_/new_.
export const PADRAO_MEDIDAS = ['account', 'annotation', 'appointment', 'contact', 'email', 'phonecall', 'task']

// soLeitura: tabelas da automação em que a administrativa só precisa continuar lendo. Tabelas padrão (PADRAO_MEDIDAS)
// não travam: o Base copia o Basic User e nenhum perfil dá Global nelas (decisão do Renan, 26/11/2026); a perda é informativa.
// aceitas (perdaAceita do mapa): tabela cr40f_/new_ cuja perda o Renan aceitou; também só informa.
// Colunas: quem perde o admin passa a obedecer a segurança de coluna; trava se os perfis diretos não cobrem a leitura
// de toda coluna protegida das tabelas cr40f_/new_ (perfil de equipe não conta; soAdmin fica só com o admin).
export function perdasPorPessoa(estado, plano, { fora = new Set(), soLeitura = new Set(), soAdmin = new Set(), aceitas = new Set() } = {}) {
  const informa = (t) => PADRAO_MEDIDAS.includes(t) || aceitas.has(t)
  const depois = aplicarPlano(estado, plano)
  const adm = new Set(administrativos(estado).map((p) => p.id))
  const universo = estado.tabelas.filter((t) => !fora.has(t))
  const protegidas = [...estado.colunas.protegidas].filter((c) => !fora.has(c.split('|')[0]) && !soAdmin.has(c)).sort()
  return estado.pessoas.map((p, i) => {
    const antes = efetivos(papeisDe(estado, p)), dep = efetivos(papeisDe(depois, depois.pessoas[i]))
    const linha = { id: p.id, ...perdas(antes, dep, estado.tabelas) }
    if (adm.has(p.id)) {
      linha.essenciais = universo.filter((t) => !informa(t) && perdeEm(antes, dep, t, soLeitura.has(t) ? ['Read'] : ESSENCIAIS))
      linha.secundarios = universo.filter((t) => perdeEm(antes, dep, t, informa(t) ? TUDO : soLeitura.has(t) ? SO_LEITURA_INFORMA : SECUNDARIOS))
      const le = new Set([...(estado.colunas.deUsuario.get(p.id) ?? [])].flatMap((f) => [...(estado.colunas.leitura.get(f) ?? [])]))
      linha.colunas = antes.admin && !dep.admin ? protegidas.filter((c) => !le.has(c)) : []
    }
    return linha
  })
}

export function conferirManter(estado, manter) {
  if (!manter.size) return [{ motivo: 'ACESSOS_ADMINS_MANTER vazia: o corte tiraria o admin de todas as pessoas' }]
  const porId = new Map(estado.pessoas.map((p) => [p.id, p]))
  const erros = []
  for (const id of manter) {
    const p = porId.get(id)
    if (!p || p.app || id === estado.servico) erros.push({ id, motivo: 'admin a manter não é pessoa ativa' })
    else if (!p.diretos.some((r) => estado.papeis.get(r)?.admin)) erros.push({ id, motivo: 'admin a manter não tem Administrador do Sistema direto' })
  }
  return erros
}

export function travasDePessoas(lista, { uso, incertas = new Set() }) {
  const travas = [], informativo = []
  for (const p of lista) {
    const usadas = p.escrita.filter((t) => incertas.has(t) || uso.get(t)?.has(p.id))
    const semUso = [...p.leitura, ...p.escrita.filter((t) => !usadas.includes(t))]
    if (usadas.length) travas.push({ id: p.id, tabelas: usadas })
    if (semUso.length) informativo.push({ id: p.id, tabelas: semUso })
  }
  return { travas, informativo }
}

// Pega também o conector antigo (shared_commondataservice): sem entityName, o flow que o usa fica incerto.
const DATAVERSE = /commondataservice/i

// Tabelas que o flow toca pelo conector do Dataverse. Qualquer operação do conector sem tabela conhecida
// (expressão, ação sem entityName, nome fora do catálogo) deixa o flow incerto.
export function tabelasDoFlow(clientdata, catalogo) {
  let definicao
  try {
    definicao = JSON.parse(clientdata)?.properties?.definition
  } catch {
    return { tabelas: [], incerto: true }
  }
  if (!definicao) return { tabelas: [], incerto: true }
  const tabelas = new Set()
  let incerto = false
  const visitar = (no) => {
    const host = no?.inputs?.host
    if (host && DATAVERSE.test(JSON.stringify(host))) {
      const p = no.inputs.parameters ?? {}
      const bruto = p.entityName ?? p['subscriptionRequest/entityname']
      const logico = typeof bruto === 'string' && !bruto.includes('@') ? catalogo.get(bruto.toLowerCase()) : undefined
      if (logico) tabelas.add(logico)
      else incerto = true
    }
    for (const v of Object.values(no ?? {})) if (v && typeof v === 'object') visitar(v)
  }
  visitar(definicao)
  return { tabelas: [...tabelas].sort(), incerto }
}

export function travasDeFlows(flows, { perdasPorUsuario, servico, manter, equipeCorte }) {
  const travas = []
  for (const f of flows) {
    if (f.dono.tipo === 'equipe') {
      if (f.dono.id === equipeCorte) travas.push({ id: f.id, motivo: 'dono é a equipe do corte' })
      continue
    }
    if (f.dono.id === servico || manter.has(f.dono.id)) continue
    if (f.incerto) {
      travas.push({ id: f.id, motivo: 'tabelas do flow incertas: mover o flow para a conta de serviço' })
      continue
    }
    const p = perdasPorUsuario.get(f.dono.id)
    const perdidas = f.tabelas.filter((t) => p && (p.escrita.includes(t) || p.leitura.includes(t)))
    if (perdidas.length) travas.push({ id: f.id, motivo: 'dono perde acesso a tabela do flow', tabelas: perdidas })
  }
  return travas
}

export function montarRelatorio({ estado, manter, uso, incertas, flows, referencias = [], fora = new Set(), soLeitura, soAdmin, aceitas }) {
  const erros = conferirManter(estado, manter)
  const plano = planoDoCorte(estado, { manter })
  const lista = perdasPorPessoa(estado, plano, { fora, soLeitura, soAdmin, aceitas })
  const travasAdmin = lista.filter((p) => p.essenciais?.length).map((p) => ({ id: p.id, tabelas: p.essenciais }))
  const travasColunas = lista.filter((p) => p.colunas?.length).map((p) => ({ id: p.id, colunas: p.colunas }))
  const secundariosAdmin = lista.filter((p) => p.secundarios?.length).map((p) => ({ id: p.id, tabelas: p.secundarios }))
  const { travas, informativo } = travasDePessoas(lista, { uso, incertas })
  const perdasPorUsuario = new Map(lista.map((p) => [p.id, p]))
  const travasFlows = travasDeFlows(flows, { perdasPorUsuario, servico: estado.servico, manter, equipeCorte: estado.equipe?.id })
  const perdem = new Set(lista.filter((p) => p.escrita.length || p.leitura.length).map((p) => p.id))
  // Conexão de quem perde acesso trava: o flow que a usa passaria a falhar sem aviso.
  const travasConexao = referencias.filter((r) => perdem.has(r.dono))
  return {
    zero: !erros.length && !travas.length && !travasFlows.length && !travasAdmin.length && !travasColunas.length && !travasConexao.length,
    erros, plano, travas, travasFlows, travasAdmin, travasColunas, travasConexao, informativo, secundariosAdmin,
    administrativos: administrativos(estado).length,
    incertas: [...incertas].sort(),
  }
}

// Log público do Actions: só contagens, nomes de tabela e ids curtos com hash.
export function resumoPublico(rel, { ambiente, sal }) {
  const h = (id) => hashCurto(id, sal)
  const pessoas = new Set(rel.plano.pessoasRemover.map((p) => p.usuario)).size
  const lista = (itens, f) => (itens.length ? ` (${itens.map(f).join('; ')})` : '')
  return [
    `Corte dos acessos (${ambiente}): ${rel.zero ? 'ZERO, pode aplicar' : 'TRAVADO, nada aplicado'}`,
    `Plano: equipe perde ${rel.plano.equipeRemover.length} papel(is) e ganha ${rel.plano.equipeAdicionar.length}; ${rel.plano.pessoasRemover.length} papel(is) direto(s) saem de ${pessoas} pessoa(s)`,
    `Travas de pessoas: ${rel.travas.length}${lista(rel.travas, (t) => `${h(t.id)}: ${t.tabelas.join(', ')}`)}`,
    `Travas de flows: ${rel.travasFlows.length}${lista(rel.travasFlows, (t) => `${h(t.id)}: ${t.motivo}`)}`,
    `Travas de administrativos (${rel.administrativos} pessoa(s)): ${rel.travasAdmin.length}${lista(rel.travasAdmin, (t) => `${h(t.id)}: ${t.tabelas.join(', ')}`)}`,
    `Travas de colunas protegidas: ${rel.travasColunas.length}${lista(rel.travasColunas, (t) => `${h(t.id)}: ${t.colunas.length} coluna(s), ex. ${t.colunas.slice(0, 3).join(', ')}`)}`,
    `Travas de conexões: ${rel.travasConexao.length} referência(s) de conexão de quem perde acesso${lista(rel.travasConexao, (r) => h(r.id))}`,
    ...rel.erros.map((e) => `Erro: ${e.id ? `${h(e.id)}: ` : ''}${e.motivo}`),
    `Informativo: ${rel.informativo.length} pessoa(s) perdem acesso sem uso nos últimos ${DIAS} dias; ${rel.secundariosAdmin.length} administrativa(s) perdem só excluir, atribuir, compartilhar ou acesso em tabela padrão; tabelas sem medida de uso: ${rel.incertas.join(', ') || 'nenhuma'}`,
  ].join('\n')
}

export function fotoDoCorte(estado, plano, { ambiente, host, quando, commit }, unidade) {
  const porPessoa = new Map()
  for (const { usuario, papel } of plano.pessoasRemover) porPessoa.set(usuario, [...(porPessoa.get(usuario) ?? []), papel])
  const ids = [...plano.equipeRemover, ...plano.pessoasRemover.map((p) => p.papel)]
  return {
    versao: 2, ambiente, host, quando, commit,
    equipe: estado.equipe ? { id: estado.equipe.id, papeis: [...plano.equipeRemover] } : null,
    base: estado.base,
    pessoas: [...porPessoa].map(([id, papeis]) => ({ id, papeis })),
    nomes: Object.fromEntries(ids.map((id) => [id, estado.papeis.get(id)?.nome ?? ''])),
    unidade,
  }
}

// Foto do preparo: o que foi adicionado, para o desfazer tirar.
export function fotoDoPreparo(plano, { ambiente, host, quando, commit }) {
  return { versao: 3, ambiente, host, quando, commit, papeis: plano.papeis, colunas: plano.colunas }
}

export function lerFoto(texto) {
  let f
  try {
    f = JSON.parse(String(texto).replace(/^﻿/, ''))
  } catch {
    f = null
  }
  const ids = (lista) => Array.isArray(lista) && lista.every((x) => GUID.test(x))
  const pares = (lista, campo) => Array.isArray(lista) && lista.every((x) => GUID.test(x?.usuario ?? '') && GUID.test(x?.[campo] ?? ''))
  if (f?.versao === 3) {
    if (!AMBIENTES.includes(f.ambiente) || typeof f.host !== 'string' || !pares(f.papeis, 'papel') || !pares(f.colunas, 'perfil')) {
      throw new Error('foto do preparo em formato desconhecido; nada feito')
    }
    return f
  }
  const ok = (f?.versao === 1 || f?.versao === 2) && AMBIENTES.includes(f.ambiente) && typeof f.host === 'string' &&
    (f.equipe === null || (GUID.test(f.equipe?.id ?? '') && ids(f.equipe.papeis))) && Array.isArray(f.pessoas) && f.pessoas.every((p) => GUID.test(p?.id ?? '') && ids(p.papeis))
  if (!ok) throw new Error('foto do corte em formato desconhecido; nada feito')
  if (f.versao === 2) {
    const u = f.unidade
    const unidadeOk = u && typeof u.existia === 'boolean' && typeof u.recursoAntes === 'boolean' && ids(u.documentos) &&
      Array.isArray(u.trocas) && u.trocas.every((t) => GUID.test(t?.usuario ?? '') && GUID.test(t?.papel ?? ''))
    if (!unidadeOk) throw new Error('foto do corte versao 2 sem unidade valida; nada feito')
  }
  return f
}

export function mesmoPlano(foto, plano) {
  const chave = (lista) => JSON.stringify([...lista].sort())
  return chave(foto.equipe?.papeis ?? []) === chave(plano.equipeRemover) &&
    chave(foto.pessoas.flatMap((p) => p.papeis.map((r) => `${p.id}|${r}`))) === chave(plano.pessoasRemover.map((p) => `${p.usuario}|${p.papel}`))
}

// União de todas as fotos: um corte em mais de uma execução continua desfazível. Perfil - Base fica na equipe.
export function planoDesfazer(todas, estado) {
  const fotos = todas.filter((f) => f.versao !== 3)
  const daEquipe = new Set(estado.equipe ? estado.equipes.get(estado.equipe.id) ?? [] : [])
  const pessoas = new Map(estado.pessoas.filter((p) => !p.app).map((p) => [p.id, p]))
  const equipe = new Set(), diretos = new Map(), ignorados = new Set()
  for (const f of fotos) {
    if ((f.equipe?.id ?? null) !== (estado.equipe?.id ?? null)) throw new Error('foto de outra equipe; nada feito')
    for (const r of f.equipe?.papeis ?? []) {
      if (!estado.papeis.has(r)) ignorados.add(r)
      else if (!daEquipe.has(r)) equipe.add(r)
    }
    for (const p of f.pessoas) {
      const atual = pessoas.get(p.id)
      if (!atual) { ignorados.add(p.id); continue }
      for (const r of p.papeis) {
        if (!estado.papeis.has(r)) ignorados.add(r)
        else if (!atual.diretos.includes(r)) diretos.set(`${p.id}|${r}`, { usuario: p.id, papel: r })
      }
    }
  }
  return { equipeAdicionar: [...equipe], pessoasAdicionar: [...diretos.values()], ignorados: [...ignorados] }
}

// Tira só o que o preparo pôs e ainda está lá. Limitação: perfil igual dado depois à mão também sai.
export function planoDesfazerPreparo(todas, estado) {
  const fotos = todas.filter((f) => f.versao === 3)
  const pessoas = new Map(estado.pessoas.map((p) => [p.id, p]))
  const papeis = new Map(), colunas = new Map()
  for (const f of fotos) {
    for (const x of f.papeis) if (pessoas.get(x.usuario)?.diretos.includes(x.papel)) papeis.set(`${x.usuario}|${x.papel}`, x)
    for (const x of f.colunas) if (estado.colunas.deUsuario.get(x.usuario)?.has(x.perfil)) colunas.set(`${x.usuario}|${x.perfil}`, x)
  }
  return { papeis: [...papeis.values()], colunas: [...colunas.values()] }
}
