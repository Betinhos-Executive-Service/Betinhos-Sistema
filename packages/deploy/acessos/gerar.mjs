// Gera perfis.gerado.json (o que o motor aplica no Dataverse) a partir dos mapas versionados no shell.
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'

const caminho = (rel) => fileURLToPath(new URL(rel, import.meta.url))
export const CAMINHO_MAPA = caminho('../../../apps/shell/src/nav/acessosMapa.json')
export const CAMINHO_COLUNAS = caminho('../../../apps/shell/src/nav/acessosColunas.json')
export const CAMINHO_GERADO = caminho('./perfis.gerado.json')
export const hashDe = (texto) => createHash('sha256').update(texto.replace(/\r\n/g, '\n')).digest('hex')

// Nenhum papel Perfil - * pode receber: personalizacao, atribuicao de papel, agir em nome de outro, segredo.
export const PROIBIDO =
  '^prv(Create|Write|Delete|Assign|Share)(WebResource|Workflow|Solution|Publisher|Entity|Attribute|Relationship|OptionSet|SystemForm|Query|SavedQueryVisualizations|AppModule|SiteMap|PluginAssembly|PluginType|SdkMessage\\w*|CustomAPI\\w*|Role|FieldSecurityProfile|FieldPermission|EnvironmentVariable\\w*|ConnectionReference|Connector|Customization)$|^prv(Publish|Import|Export)Customization$|^prvActOnBehalfOfAnotherUser$|cr40f_segredo'
// Ao copiar App Opener e Basic User para o Base, privilegio de tabela customizada nao vem junto.
export const COPIAR_SEM = '^prv[A-Za-z]+?(cr40f_|new_)'

const ACOES = {
  donas: ['Read', 'Create', 'Write', 'Append', 'AppendTo'],
  filhas: ['Read', 'Create', 'Write', 'Delete', 'Append', 'AppendTo'],
  cria: ['Read', 'Create', 'Write', 'Append', 'AppendTo'],
  edita: ['Read', 'Write', 'Append', 'AppendTo'],
  leitura: ['Read', 'AppendTo'],
}
const ORDEM = { Basic: 1, Local: 2, Deep: 4, Global: 8 }

function juntar(alvo, tabela, acoes, profundidade = 'Global') {
  const atual = (alvo[tabela] ??= {})
  for (const acao of acoes) if (!atual[acao] || ORDEM[atual[acao]] < ORDEM[profundidade]) atual[acao] = profundidade
}
const ordenar = (obj) => Object.fromEntries(Object.keys(obj).sort().map((k) => [k, obj[k]]))
const ordenarTabelas = (tabelas) => Object.fromEntries(Object.keys(tabelas).sort().map((t) => [t, ordenar(tabelas[t])]))

function tabelasDoModulo(modulo, gestor) {
  const tabelas = {}
  for (const classe of Object.keys(ACOES)) for (const tabela of modulo[classe] ?? []) juntar(tabelas, tabela, ACOES[classe])
  if (gestor) for (const tabela of modulo.donas ?? []) juntar(tabelas, tabela, ['Delete'])
  return ordenarTabelas(tabelas)
}

function tabelasDaBase(base) {
  const tabelas = {}
  for (const t of base.leitura) juntar(tabelas, t, ['Read', 'AppendTo'])
  for (const t of base.proprio) {
    juntar(tabelas, t, ['Read'])
    juntar(tabelas, t, ['Create', 'Write', 'Delete', 'Append', 'AppendTo'], 'Basic')
  }
  for (const t of base.cria) juntar(tabelas, t, ['Create', 'Append', 'AppendTo'])
  for (const t of base.donas) juntar(tabelas, t, ['Read', 'Create', 'Write', 'Delete', 'Append', 'AppendTo'])
  for (const [t, acoes] of Object.entries(base.sistema)) for (const [acao, prof] of Object.entries(acoes)) juntar(tabelas, t, [acao], prof)
  return ordenarTabelas(tabelas)
}

function colunasDaRef(colunas, ref) {
  const [tabela, grupo] = ref.split('.')
  const grupos = colunas.grupos[tabela]
  if (!grupos || (grupo !== '*' && !grupos[grupo])) throw new Error(`Grupo de colunas desconhecido: ${ref}`)
  const lista = grupo === '*' ? Object.values(grupos).flat() : grupos[grupo]
  return lista.map((coluna) => ({ tabela, coluna }))
}

function permissoes(colunas, area, gestor) {
  const mapa = new Map()
  for (const nivel of gestor ? ['operador', 'gestor'] : ['operador']) {
    const def = colunas.perfis[area][nivel]
    for (const [modo, refs] of [['ler', def.ler], ['editar', def.editar]])
      for (const ref of refs)
        for (const { tabela, coluna } of colunasDaRef(colunas, ref)) {
          const chave = `${tabela}.${coluna}`
          const atual = mapa.get(chave) ?? { tabela, coluna, ler: true, editar: false }
          if (modo === 'editar') atual.editar = true
          mapa.set(chave, atual)
        }
  }
  return [...mapa.keys()].sort().map((k) => mapa.get(k))
}

const AREAS = { operacional: 'Operacional', financeiro: 'Financeiro', frota: 'Frota', rh: 'RH' }
const NIVEIS = { operador: 'Operador', gestor: 'Gestor' }
// O shell le os proprios papeis (direto e por equipe) e a tela de acessos lista pessoas.
const LEITURA_DE_ACESSOS = { prvReadRole: 'Global', prvReadTeam: 'Global', prvReadUser: 'Global' }

export function gerarPerfis(mapa, colunas) {
  const doAdministrador = tabelasDoModulo(mapa.modulos.acessos, false)
  juntar(doAdministrador, 'cr40f_acessohistorico', ['Read'])
  const papeis = {
    'Perfil - Base': { copiarDe: ['App Opener', 'Basic User'], app: 'cr40f_ModelDrivenBetinhos', tabelas: tabelasDaBase(mapa.base), privilegios: LEITURA_DE_ACESSOS },
    'Perfil - Administrador de acessos': {
      copiarDe: [],
      app: null,
      tabelas: ordenarTabelas(doAdministrador),
      privilegios: LEITURA_DE_ACESSOS,
    },
  }
  // Funcionarios tem seguranca de coluna: sem perfil de coluna o administrador de acessos ve o e-mail Microsoft vazio.
  const perfisDeColuna = { 'Perfil - Administrador de acessos': permissoes(colunas, 'acessos', false) }
  for (const [area, rotuloArea] of Object.entries(AREAS))
    for (const [nivel, rotuloNivel] of Object.entries(NIVEIS)) {
      const nome = `Perfil - ${rotuloArea} - ${rotuloNivel}`
      papeis[nome] = { copiarDe: [], app: null, tabelas: tabelasDoModulo(mapa.modulos[area], nivel === 'gestor'), privilegios: {} }
      perfisDeColuna[nome] = permissoes(colunas, area, nivel === 'gestor')
    }
  return { proibido: PROIBIDO, copiarSem: COPIAR_SEM, papeis: ordenar(papeis), colunas: ordenar(perfisDeColuna) }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv[2] === '--hash') console.log(hashDe(readFileSync(CAMINHO_GERADO, 'utf8')))
  else {
    const gerado = gerarPerfis(JSON.parse(readFileSync(CAMINHO_MAPA, 'utf8')), JSON.parse(readFileSync(CAMINHO_COLUNAS, 'utf8')))
    writeFileSync(CAMINHO_GERADO, JSON.stringify(gerado, null, 2) + '\n')
    console.log(`perfis.gerado.json: ${Object.keys(gerado.papeis).length} papeis, ${Object.keys(gerado.colunas).length} perfis de coluna`)
  }
}
