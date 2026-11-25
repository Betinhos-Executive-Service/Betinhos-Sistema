import { readFileSync } from 'node:fs'

// Corte da unidade Frota (plano 4, tarefa 15): liga a propriedade entre unidades, cria a unidade "Frota"
// (filha da raiz, lida por nome), põe nela os documentos de veículo e passa quem tem papel Frota para a cópia.
// Nada de GUID ou nome real no código: tudo é lido do ambiente.

export const UNIDADE = 'Frota'
// Nomes lidos do mapa gerado (perfis.gerado.json): nada de nome escrito à mão aqui.
export const PAPEIS_FROTA = Object.keys(JSON.parse(readFileSync(new URL('./perfis.gerado.json', import.meta.url), 'utf8')).papeis)
  .filter((n) => n.startsWith('Perfil - Frota - ')).sort()
const CHAVE = 'EnableOwnershipAcrossBusinessUnits'

export const recursoLigado = (xml) => new RegExp(`<${CHAVE}>true<`, 'i').test(xml ?? '')

export function xmlComRecurso(xml, ligado) {
  const valor = ligado ? 'true' : 'false'
  const re = new RegExp(`<${CHAVE}>[^<]*</${CHAVE}>`, 'i')
  if (re.test(xml)) return xml.replace(re, `<${CHAVE}>${valor}</${CHAVE}>`)
  return xml.replace(/<\/OrgSettings>\s*$/i, `<${CHAVE}>${valor}</${CHAVE}></OrgSettings>`)
}

const filtroNomes = encodeURIComponent(PAPEIS_FROTA.map((n) => `name eq '${n.replace(/'/g, "''")}'`).join(' or '))

export async function lerDatasNulas(dv) {
  const defs = await dv.todos('EntityDefinitions?$select=LogicalName,IsCustomEntity&$expand=Attributes($select=LogicalName,AttributeType,IsCustomAttribute)')
  const tabelas = defs.filter((e) => (e.Attributes ?? []).some((a) => a.AttributeType === 'DateTime' && (e.IsCustomEntity || a.IsCustomAttribute)))
  const nulas = []
  for (const e of tabelas) {
    const cols = await dv.todos(`EntityDefinitions(LogicalName='${e.LogicalName}')/Attributes/Microsoft.Dynamics.CRM.DateTimeAttributeMetadata?$select=LogicalName,DateTimeBehavior,IsCustomAttribute`)
    for (const c of cols) if ((e.IsCustomEntity || c.IsCustomAttribute) && !c.DateTimeBehavior?.Value) nulas.push(`${e.LogicalName}.${c.LogicalName}`)
  }
  return nulas.sort()
}

export async function lerUnidade(dv) {
  const org = (await dv.todos('organizations?$select=organizationid,orgdborgsettings'))[0]
  const recurso = recursoLigado(org.orgdborgsettings)
  const bus = await dv.todos('businessunits?$select=businessunitid,name,_parentbusinessunitid_value,isdisabled')
  const raizes = bus.filter((b) => !b._parentbusinessunitid_value)
  if (raizes.length !== 1) throw new Error(`Unidade raiz não encontrada (${raizes.length}).`)
  const raiz = raizes[0].businessunitid
  const frotas = bus.filter((b) => b._parentbusinessunitid_value === raiz && !b.isdisabled && b.name?.toLowerCase() === UNIDADE.toLowerCase())
  if (frotas.length > 1) throw new Error('Há mais de uma unidade Frota ativa; corrija antes do corte.')
  const frota = frotas[0]?.businessunitid ?? null
  const roles = await dv.todos(`roles?$select=roleid,name,_businessunitid_value,_parentrootroleid_value&$filter=${filtroNomes}`)
  const raizPorNome = {}, copiaPorRaiz = {}
  for (const r of roles) {
    if (r._businessunitid_value === raiz) raizPorNome[r.name] = r.roleid
    else if (frota && r._businessunitid_value === frota && r._parentrootroleid_value) copiaPorRaiz[r._parentrootroleid_value] = r.roleid
  }
  const faltam = PAPEIS_FROTA.filter((n) => !raizPorNome[n])
  if (faltam.length) throw new Error(`Papel(is) raiz da Frota ausente(s) no ambiente: ${faltam.join(', ')}; rode o Deploy dos perfis antes do corte.`)
  const ids = new Set([...Object.values(raizPorNome), ...Object.values(copiaPorRaiz)])
  const atribuicoes = (await dv.ligacao('systemuserroles', 'systemuserid,roleid'))
    .filter((l) => ids.has(l.roleid)).map((l) => ({ usuario: l.systemuserid, papel: l.roleid }))
  const documentos = (await dv.todos(`cr40f_documentos?$select=cr40f_documentoid,_owningbusinessunit_value&$filter=${encodeURIComponent('_cr40f_veiculo_value ne null and _cr40f_funcionario_value eq null')}`))
    .map((d) => ({ id: d.cr40f_documentoid, unidade: d._owningbusinessunit_value }))
  return {
    org: { id: org.organizationid, xml: org.orgdborgsettings }, recurso, raiz, frota,
    raizPorNome, copiaPorRaiz, atribuicoes, documentos,
    // Com o recurso já ligado a varredura não importa (a trava só vale antes de ligar).
    datasNulas: recurso ? [] : await lerDatasNulas(dv),
  }
}

export function planoDaUnidade(u) {
  const raizes = new Set(Object.values(u.raizPorNome))
  return {
    ligarRecurso: !u.recurso,
    criarUnidade: !u.frota,
    documentos: u.documentos.filter((d) => !u.frota || d.unidade !== u.frota).map((d) => d.id).sort(),
    trocas: u.atribuicoes.filter((a) => raizes.has(a.papel)).sort((a, b) => a.usuario.localeCompare(b.usuario) || a.papel.localeCompare(b.papel)),
    travas: u.recurso ? [] : [...u.datasNulas],
  }
}

export const unidadeVazia = (p) => !p.ligarRecurso && !p.criarUnidade && p.documentos.length === 0 && p.trocas.length === 0 && p.travas.length === 0

async function esperarCopias(dv, frota, raizes, esperar) {
  for (let i = 0; i < 60; i++) {
    const roles = await dv.todos(`roles?$select=roleid,name,_businessunitid_value,_parentrootroleid_value&$filter=${filtroNomes}`)
    const copias = Object.fromEntries(roles.filter((r) => r._businessunitid_value === frota && r._parentrootroleid_value).map((r) => [r._parentrootroleid_value, r.roleid]))
    if (raizes.every((r) => copias[r])) return copias
    await esperar(5000)
  }
  throw new Error('As cópias dos papéis Frota não apareceram na unidade em 5 min; rode de novo o aplicar.')
}

const ref = (dv, set, id) => ({ '@odata.id': `${typeof dv.api === 'string' ? `${dv.api}/` : ''}${set}(${id})` })

export async function aplicarUnidade(dv, plano, u, { esperar = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  if (plano.travas.length) throw new Error(`Colunas DateTime sem DateTimeBehavior: ${plano.travas.join(', ')}`)
  if (plano.ligarRecurso) await dv.chamar('PATCH', `organizations(${u.org.id})`, { orgdborgsettings: xmlComRecurso(u.org.xml, true) })
  let frota = u.frota
  if (plano.criarUnidade) {
    const criada = await dv.chamar('POST', 'businessunits', { name: UNIDADE, 'parentbusinessunitid@odata.bind': `/businessunits(${u.raiz})` }, { Prefer: 'return=representation' })
    frota = criada?.businessunitid ?? (await lerUnidade(dv)).frota
  }
  const copias = await esperarCopias(dv, frota, Object.values(u.raizPorNome), esperar)
  for (const id of plano.documentos) await dv.chamar('PATCH', `cr40f_documentos(${id})`, { 'owningbusinessunit@odata.bind': `/businessunits(${frota})` })
  for (const t of plano.trocas) {
    await dv.chamar('POST', `systemusers(${t.usuario})/systemuserroles_association/$ref`, ref(dv, 'roles', copias[t.papel]))
    await dv.chamar('DELETE', `systemusers(${t.usuario})/systemuserroles_association(${t.papel})/$ref`)
  }
}

export function fotoDaUnidade(u, plano) {
  return { existia: Boolean(u.frota), recursoAntes: u.recurso, documentos: plano.documentos, trocas: plano.trocas }
}

export function planoDesfazerUnidade(fotos, u) {
  const unidades = fotos.map((f) => f.unidade).filter(Boolean)
  const raizDaCopia = Object.fromEntries(Object.entries(u.copiaPorRaiz).map(([r, c]) => [c, r]))
  const trocas = u.atribuicoes.filter((a) => raizDaCopia[a.papel]).map((a) => ({ usuario: a.usuario, de: a.papel, para: raizDaCopia[a.papel] }))
    .sort((a, b) => a.usuario.localeCompare(b.usuario))
  const documentos = u.frota ? u.documentos.filter((d) => d.unidade === u.frota).map((d) => d.id).sort() : []
  return {
    trocas, documentos,
    apagarUnidade: u.frota && unidades.some((x) => x.existia === false) ? u.frota : null,
    desligarRecurso: u.recurso && unidades.some((x) => x.recursoAntes === false),
  }
}

export async function aplicarDesfazerUnidade(dv, plano, u) {
  for (const t of plano.trocas) {
    await dv.chamar('POST', `systemusers(${t.usuario})/systemuserroles_association/$ref`, ref(dv, 'roles', t.para))
    await dv.chamar('DELETE', `systemusers(${t.usuario})/systemuserroles_association(${t.de})/$ref`)
  }
  for (const id of plano.documentos) await dv.chamar('PATCH', `cr40f_documentos(${id})`, { 'owningbusinessunit@odata.bind': `/businessunits(${u.raiz})` })
  if (plano.apagarUnidade) {
    await dv.chamar('PATCH', `businessunits(${plano.apagarUnidade})`, { isdisabled: true })
    await dv.chamar('DELETE', `businessunits(${plano.apagarUnidade})`)
  }
  if (plano.desligarRecurso) await dv.chamar('PATCH', `organizations(${u.org.id})`, { orgdborgsettings: xmlComRecurso(u.org.xml, false) })
}

// Confere se a unidade de agora ainda é a que a foto guardou (mesmo papel do mesmoPlano dos papéis).
export function mesmaUnidade(foto, plano) {
  const un = foto.unidade
  if (!un) return unidadeVazia(plano)
  const chave = (lista) => JSON.stringify([...lista].sort())
  return plano.ligarRecurso === !un.recursoAntes && plano.criarUnidade === !un.existia && chave(plano.documentos) === chave(un.documentos) &&
    chave(plano.trocas.map((t) => `${t.usuario}|${t.papel}`)) === chave(un.trocas.map((t) => `${t.usuario}|${t.papel}`))
}

export function resumoUnidade(plano) {
  return [
    `Recurso: ${plano.ligarRecurso ? 'ligar' : 'já ligado'}`,
    `Unidade ${UNIDADE}: ${plano.criarUnidade ? 'criar' : 'já existe'}`,
    `Documentos de veículo a mover: ${plano.documentos.length}`,
    `Trocas para a cópia: ${plano.trocas.length}`,
  ].join('\n')
}
