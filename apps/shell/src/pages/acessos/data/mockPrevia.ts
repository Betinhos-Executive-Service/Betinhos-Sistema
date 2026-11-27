import { AREAS, NIVEL_LABEL, PERFIL_LABEL, type Nivel } from '../../../app/acessos'
import colunasJson from '../../../nav/acessosColunas.json'
import mapaJson from '../../../nav/acessosMapa.json'
import { semPrefixo, type Previa, type Uso } from '../domain/previa'
import type { PerfisPessoa } from '../domain/types'

const MODULOS = mapaJson.modulos as Record<string, Record<string, string[]>>
const GRUPOS: Record<string, Record<string, string[]>> = colunasJson.grupos
const PERFIS: Record<string, Record<string, { ler: string[]; editar: string[] }>> = colunasJson.perfis

const NIVEIS = Object.keys(NIVEL_LABEL) as Nivel[]
const ordem = (nivel: Nivel | undefined) => (nivel ? NIVEIS.indexOf(nivel) + 1 : 0)

/** Pessoa do mock que, ao tirar o acesso amplo, mostra o aviso de grupo do Entra. */
export const MOCK_CARLOS = '55555555-5555-4555-8555-555555555555'

/** `tabela.grupo` (ou `tabela.*`) vira até duas colunas de verdade do grupo. */
function colunasDe(ref: string): string[] {
  const [tabela, grupo] = ref.split('.')
  const grupos = GRUPOS[tabela] ?? {}
  const colunas = grupo === '*' ? Object.values(grupos).flat() : (grupos[grupo] ?? [])
  return colunas.slice(0, 2).map((c) => `${tabela}.${c}`)
}

/** Prévia de exemplo derivada do mapa: quem baixa de nível perde o que o nível dava; "Tirar acesso amplo" perde leitura e o que o acesso amplo cobria. */
export function previaDeExemplo(atuais: PerfisPessoa, pedido: PerfisPessoa, admin: boolean, retirarAmplo: boolean): Previa {
  const perdas = new Map<string, { tabela: string | null; perde: Set<string> }>()
  const perde = (chave: string, tabela: string | null, tipos: string[]) => {
    const atual = perdas.get(chave) ?? { tabela, perde: new Set<string>() }
    for (const t of tipos) atual.perde.add(t)
    perdas.set(chave, atual)
  }
  const colunas = new Set<string>()
  const flows: Previa['flows'] = []
  for (const area of AREAS) {
    const antes = atuais.areas[area]
    const depois = pedido.areas[area]
    if (ordem(depois) >= ordem(antes)) continue
    const donas = MODULOS[area]?.donas ?? []
    const tipos = depois ? ['Delete'] : ['Read', 'Create', 'Write', 'Delete']
    for (const t of donas.slice(0, depois ? 3 : 5)) perde(t, t, tipos)
    const nivel = PERFIS[area]?.[antes ?? 'operador']
    for (const ref of [...(nivel?.ler ?? []), ...(nivel?.editar ?? [])]) colunasDe(ref).forEach((c) => colunas.add(c))
    if (!depois) flows.push({ nome: `Rotina de ${PERFIL_LABEL[area]} (exemplo)`, tipo: 'tabela', dona: true })
  }
  if (atuais.acessos && !pedido.acessos) perde('cr40f_acessohistorico', 'cr40f_acessohistorico', ['Read'])
  if (retirarAmplo) {
    for (const t of Object.values(MODULOS).flatMap((m) => m.leitura ?? []).slice(0, 4)) perde(t, t, ['Read', 'Write'])
    perde('prvExportToExcel', null, ['Use'])
  }
  return {
    admin: { antes: admin, depois: admin && !retirarAmplo },
    perdas: [...perdas].map(([chave, v]) => ({ chave, tabela: v.tabela, rotulo: v.tabela && semPrefixo(v.tabela), perde: [...v.perde], incerto: false })).sort((a, b) => a.chave.localeCompare(b.chave)),
    colunas: [...colunas].map((c) => ({ tabela: c.split('.')[0], rotulo: semPrefixo(c.split('.')[0]), coluna: c, perde: ['ler', 'criar', 'gravar'], incerto: false })),
    grupos: [],
    apps: retirarAmplo ? [{ nome: 'App de exemplo' }] : [],
    flows,
    conexoes: retirarAmplo || flows.length || perdas.size ? [{ nome: 'Conexão do Dataverse (exemplo)' }] : [],
  }
}

/** Uso de exemplo: a soma dos códigos do nome dá um número estável; um terço das tabelas sem gravação. */
export function usoDeExemplo(tabelas: string[]): Uso[] {
  return tabelas.map((tabela) => {
    const soma = [...tabela].reduce((n, c) => n + c.charCodeAt(0), 0)
    return { tabela, registros: soma % 3 === 0 ? 0 : (soma % 50) + 1, limitado: false, incerto: false }
  })
}
