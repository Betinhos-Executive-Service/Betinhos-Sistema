// Lê do Dataverse o estado que corte-regras.mjs avalia. Somente GET.
import { ADMIN, EQUIPE, NIVEL, PAPEL_BASE, tabelasDoFlow } from './corte-regras.mjs'

// Tabelas padrão medidas além das customizadas (as que a operação cria e altera no dia a dia).
export const PADRAO_MEDIDAS = ['account', 'annotation', 'appointment', 'contact', 'email', 'phonecall', 'task']

function agrupar(linhas, chave, valor) {
  const mapa = new Map()
  for (const l of linhas) mapa.set(l[chave], [...(mapa.get(l[chave]) ?? []), l[valor]])
  return mapa
}

export async function lerCatalogo(dv) {
  const linhas = (await dv.um('EntityDefinitions?$select=LogicalName,EntitySetName,IsCustomEntity,TableType,Privileges')).value
  const indice = new Map(), catalogo = new Map(), conjuntoDe = new Map(), tabelas = []
  for (const e of linhas) {
    catalogo.set(e.LogicalName.toLowerCase(), e.LogicalName)
    if (e.EntitySetName) {
      catalogo.set(e.EntitySetName.toLowerCase(), e.LogicalName)
      conjuntoDe.set(e.LogicalName, e.EntitySetName)
    }
    for (const p of e.Privileges ?? []) indice.set(p.PrivilegeId, { tabela: e.LogicalName, tipo: p.PrivilegeType })
    if (e.TableType !== 'Virtual' && e.TableType !== 'Elastic' && (e.IsCustomEntity || PADRAO_MEDIDAS.includes(e.LogicalName))) tabelas.push(e.LogicalName)
  }
  return { indice, catalogo, conjuntoDe, tabelas: tabelas.sort() }
}

export async function lerEstado(dv) {
  const { UserId } = await dv.um('WhoAmI')
  const equipes = await dv.todos(`teams?$select=teamid,name,_businessunitid_value&$filter=name eq '${EQUIPE}'`)
  if (equipes.length !== 1) throw new Error(`equipe ${EQUIPE}: ${equipes.length} encontradas (esperado 1)`)
  const equipe = { id: equipes[0].teamid, bu: equipes[0]._businessunitid_value }
  const linhasPapeis = await dv.todos('roles?$select=roleid,name,_businessunitid_value')
  const base = linhasPapeis.find((r) => r.name === PAPEL_BASE && r._businessunitid_value === equipe.bu)
  if (!base) throw new Error(`${PAPEL_BASE} não existe na unidade da equipe`)
  const teamroles = await dv.ligacao('teamroles', 'teamid,roleid')
  const membros = await dv.ligacao('teammembership', 'teamid,systemuserid')
  const userroles = await dv.ligacao('systemuserroles', 'systemuserid,roleid')
  // accessmode 3 (suporte) e 5 (admin delegado) são contas da Microsoft: fora da avaliação.
  const usuarios = await dv.todos('systemusers?$select=systemuserid,applicationid,accessmode&$filter=isdisabled eq false')
  const equipesPapeis = agrupar(teamroles, 'teamid', 'roleid')
  const equipesDe = agrupar(membros, 'systemuserid', 'teamid')
  const diretosDe = agrupar(userroles, 'systemuserid', 'roleid')
  const pessoas = usuarios
    .filter((u) => u.accessmode !== 3 && u.accessmode !== 5)
    .map((u) => ({ id: u.systemuserid, app: u.applicationid != null, equipes: equipesDe.get(u.systemuserid) ?? [], diretos: diretosDe.get(u.systemuserid) ?? [] }))
  const usados = new Set([
    base.roleid,
    ...(equipesPapeis.get(equipe.id) ?? []),
    ...pessoas.flatMap((p) => [...p.diretos, ...p.equipes.flatMap((t) => equipesPapeis.get(t) ?? [])]),
  ])
  const { indice, catalogo, conjuntoDe, tabelas } = await lerCatalogo(dv)
  const papeis = new Map()
  for (const r of linhasPapeis) {
    const admin = ADMIN.includes(r.name)
    let privilegios = []
    if (!admin && usados.has(r.roleid)) {
      // A forma ligada (roles(id)/...RetrieveRolePrivilegesRole) dá 404; só a solta funciona.
      const resp = await dv.um(`RetrieveRolePrivilegesRole(RoleId=@p)?@p=${r.roleid}`)
      privilegios = (resp.RolePrivileges ?? []).flatMap((p) => {
        const i = indice.get(p.PrivilegeId)
        if (!i) return []
        // Nível desconhecido zeraria a perda e o relatório sairia limpo por engano.
        if (!(p.Depth in NIVEL)) throw new Error(`profundidade desconhecida: ${p.Depth}`)
        return [{ ...i, nivel: NIVEL[p.Depth] }]
      })
    }
    papeis.set(r.roleid, { id: r.roleid, nome: r.name, admin, privilegios })
  }
  return { servico: UserId.toLowerCase(), equipe, base: base.roleid, papeis, equipes: equipesPapeis, pessoas, tabelas, catalogo, conjuntoDe }
}

export async function lerUso(dv, tabelas, conjuntoDe, desdeIso) {
  const uso = new Map(), incertas = new Set()
  for (const t of tabelas) {
    try {
      const conjunto = conjuntoDe.get(t)
      if (!conjunto) throw new Error('sem conjunto')
      const ids = new Set()
      // $apply/groupby em lookup dá 400 no Dataverse; FetchXML agregado devolve um usuário por linha.
      // Acima de 50 mil linhas o agregado falha e a tabela fica incerta.
      for (const [data, campo] of [['createdon', 'createdby'], ['modifiedon', 'modifiedby']]) {
        const xml = `<fetch aggregate="true"><entity name="${t}"><attribute name="${campo}" groupby="true" alias="u"/>`
          + `<filter><condition attribute="${data}" operator="ge" value="${desdeIso}"/></filter></entity></fetch>`
        for (const l of (await dv.um(`${conjunto}?fetchXml=${encodeURIComponent(xml)}`)).value) if (l.u) ids.add(l.u)
      }
      uso.set(t, ids)
    } catch {
      incertas.add(t)
    }
  }
  return { uso, incertas }
}

export async function lerFlows(dv, catalogo) {
  const linhas = await dv.todos('workflows?$select=workflowid,clientdata,_owninguser_value,_owningteam_value&$filter=category eq 5 and statecode eq 1')
  return linhas.map((w) => ({
    id: w.workflowid,
    dono: w._owningteam_value ? { tipo: 'equipe', id: w._owningteam_value } : { tipo: 'usuario', id: w._owninguser_value },
    ...tabelasDoFlow(w.clientdata ?? '', catalogo),
  }))
}

export async function lerReferencias(dv) {
  const linhas = await dv.todos('connectionreferences?$select=connectionreferenceid,_owninguser_value&$filter=statecode eq 0')
  return linhas.map((r) => ({ id: r.connectionreferenceid, dono: r._owninguser_value }))
}
