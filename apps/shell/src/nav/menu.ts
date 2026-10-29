// Espelho do sitemap do app model-driven "App Betinhos Interno" (lido do Dataverse DEV em 02/10/2026).
// Cada item muda de `kind` conforme é migrado: webresource/entity (legado) -> rota React.

export type MenuItem =
  /** Tela WebResource já existente, aberta em iframe. */
  | { kind: 'webresource'; id: string; label: string; resource: string }
  /** Tabela ainda atendida pela lista/formulário nativos; o rótulo vem da metadata. */
  | { kind: 'entity'; id: string; entity: string; label?: string }
  | { kind: 'external'; id: string; label: string; url: string }
  /** Item do sitemap que o shell ainda não consegue abrir. */
  | { kind: 'unavailable'; id: string; label: string; reason: string }
  /** Tela React do próprio shell. */
  | { kind: 'page'; id: string; label: string; page: 'operacional' | 'frota' | 'funcionarios' | 'curriculos' | 'pagantes' | 'pessoas' | 'dashboard' | 'infracoes' | 'ops' | 'despesas' | 'geral' | 'documentos' | 'pendencias' | 'agentes' | 'comunicados' | 'equipamentos' | 'clientes' | 'planner' | 'validacao-cliente' | 'logs' | 'qualidade' | 'pagamento-fornecedores' | 'funcoes-operacionais' | 'inicio'; agente?: 'financeiro' | 'logistica' | 'pessoas' | 'frota'; aba?: FrotaAba }

/** Visões da Frota: cada uma é um item do menu, todas na mesma tela (`page: 'frota'`). */
export type FrotaAba = 'pendencias' | 'veiculos' | 'manutencoes' | 'multas' | 'colisoes' | 'indicadores' | 'plano' | 'checklists'

export type MenuGroup = { id: string; label: string; items: MenuItem[] }

const wr = (label: string, resource: string): MenuItem => ({ kind: 'webresource', id: resource.replace(/\.html$/i, '').toLowerCase(), label, resource })
const table = (entity: string, label?: string): MenuItem => ({ kind: 'entity', id: entity, entity, label })

export const MENU: MenuGroup[] = [
  {
    id: 'inicio',
    label: 'Início',
    items: [{ kind: 'page', id: 'inicio', label: 'Página Inicial', page: 'inicio' }],
  },
  {
    id: 'operacional',
    label: 'Operacional',
    items: [
      { kind: 'page', id: 'geral', label: 'Geral', page: 'geral' },
      { kind: 'page', id: 'dashboard', label: 'Dashboard', page: 'dashboard' },
      { kind: 'page', id: 'operacional', label: 'Resumo Operacional', page: 'operacional' },
      { kind: 'page', id: 'assistente-logistica', label: 'Assistente', page: 'agentes', agente: 'logistica' },
      { kind: 'page', id: 'funcoes-operacionais', label: 'Funções Operacionais', page: 'funcoes-operacionais' },
      table('cr40f_trocasdecarro'),
      table('new_possedeveiculo'),
      { kind: 'page', id: 'comunicados', label: 'Comunicados', page: 'comunicados' },
      { kind: 'page', id: 'qualidade', label: 'Gestão de Qualidade', page: 'qualidade' },
      { kind: 'external', id: 'infleet', label: 'Infleet', url: 'https://app.infleet.com.br/monitoring' },
      { kind: 'page', id: 'planner', label: 'Planner', page: 'planner' },
    ],
  },
  {
    id: 'financeiro',
    label: 'Financeiro',
    items: [
      wr('Composição de Preço', 'new_TelaComposicaoPreco.html'),
      { kind: 'page', id: 'ops', label: 'Ordens de Pagamento', page: 'ops' },
      { kind: 'page', id: 'pagantes', label: 'Pagantes', page: 'pagantes' },
      { kind: 'page', id: 'pendencias', label: 'Pendências', page: 'pendencias' },
      { kind: 'page', id: 'validacao-cliente', label: 'Validação do cliente', page: 'validacao-cliente' },
      { kind: 'page', id: 'assistente-financeiro', label: 'Assistente', page: 'agentes', agente: 'financeiro' },
      table('cr40f_recibos_v2'),
      { kind: 'page', id: 'pagamento-fornecedores', label: 'Pagamento de Fornecedores', page: 'pagamento-fornecedores' },
      { kind: 'page', id: 'despesas-operacionais', label: 'Despesas (App Motoristas)', page: 'despesas' },
    ],
  },
  {
    id: 'frota',
    label: 'Frota',
    items: [
      // `frota` continua sendo a rota das Pendências: links antigos `#/frota?ficha=…` seguem abrindo.
      { kind: 'page', id: 'frota', label: 'Pendências', page: 'frota', aba: 'pendencias' },
      { kind: 'page', id: 'frota-veiculos', label: 'Veículos', page: 'frota', aba: 'veiculos' },
      { kind: 'page', id: 'frota-manutencoes', label: 'Manutenções', page: 'frota', aba: 'manutencoes' },
      { kind: 'page', id: 'frota-multas', label: 'Multas', page: 'frota', aba: 'multas' },
      { kind: 'page', id: 'frota-colisoes', label: 'Colisões', page: 'frota', aba: 'colisoes' },
      { kind: 'page', id: 'frota-indicadores', label: 'Indicadores', page: 'frota', aba: 'indicadores' },
      { kind: 'page', id: 'frota-plano', label: 'Plano preventivo', page: 'frota', aba: 'plano' },
      { kind: 'page', id: 'assistente-frota', label: 'Assistente', page: 'agentes', agente: 'frota' },
      { kind: 'page', id: 'frota-checklists', label: 'Checklists de Veículos', page: 'frota', aba: 'checklists' },
    ],
  },
  {
    id: 'cadastros',
    label: 'Cadastros',
    items: [
      { kind: 'page', id: 'pessoas', label: 'Pessoas', page: 'pessoas' },
      { kind: 'page', id: 'clientes', label: 'Clientes', page: 'clientes' },
      { kind: 'page', id: 'funcionarios', label: 'Funcionários', page: 'funcionarios' },
      { kind: 'page', id: 'documentos', label: 'Documentos', page: 'documentos' },
      { kind: 'page', id: 'assistente-pessoas', label: 'Assistente', page: 'agentes', agente: 'pessoas' },
      { kind: 'page', id: 'curriculos', label: 'Currículos', page: 'curriculos' },
      { kind: 'page', id: 'equipamentos', label: 'Equipamentos', page: 'equipamentos' },
    ],
  },
  {
    id: 'back-end',
    label: 'Back-End',
    items: [
      table('cr40f_servicosporpassageiro'),
      // O dashboard React substitui o antigo no uso diário; o legado fica como modo TV (link "Abrir modo TV" no Dashboard).
      wr('Dashboard antigo (TV)', 'new_dashboard'),
      wr('Despesas Operacionais', 'new_teladespesasoperacionais'),
      table('new_fotomanutencao'),
      { kind: 'page', id: 'logs-apps', label: 'Logs dos apps', page: 'logs' },
      table('cr40f_anexodespesaoperacional'),
      table('cr40f_categoriadespesaoperacional'),
      table('cr40f_formapagamentodespesa'),
      table('cr40f_anexocolisao_v2'),
      table('cr40f_anexorecebimento_v2'),
      // Substituído por #/comunicados (Operacional); fica aqui enquanto houver uso.
      wr('Comunicados (antigo)', 'cr40f_GerenciarComunicados.html'),
      table('cr40f_pedidodecotacao'),
      wr('Fluxo de Caixa', 'cr40f_TelaFluxoDeCaixa.html'),
      table('cr40f_composicaodeprecos'),
      table('new_marketing'),
    ],
  },
]

export const ALL_ITEMS = MENU.flatMap((group) => group.items)
export const ENTITY_NAMES = ALL_ITEMS.flatMap((item) => (item.kind === 'entity' ? [item.entity] : []))
export const DEFAULT_ITEM = MENU[0].items[0]

/** Itens do menu que viraram visão da Frota: `#/frota?aba=x` → `#/frota-x`; `#/infracoes` → aba Infrações de Multas. */
export function rotaAtualizada(id: string, query: URLSearchParams): { id: string; query: URLSearchParams } | null {
  // O WebResource da Página Inicial virou a tela React; links antigos seguem abrindo.
  if (id === 'cr40f_homebetinhos') return { id: 'inicio', query }
  // A tabela nativa de clientes virou a tela React; links antigos seguem abrindo.
  if (id === 'cr40f_clientes1') return { id: 'clientes', query }
  // O WebResource e a página personalizada de Funções Operacionais viraram a tela React.
  if (id === 'new_telafuncoesoperacionais' || id === 'custom-page-funcoes-operacionais') return { id: 'funcoes-operacionais', query }
  // O WebResource da Gestão de Qualidade virou a tela React; links antigos seguem abrindo.
  if (id === 'new_gestao_erros_operacionais') return { id: 'qualidade', query }
  // O WebResource de Pagamento de Fornecedores virou a tela React; links antigos seguem abrindo.
  if (id === 'cr40f_telapagamentofornecedores') return { id: 'pagamento-fornecedores', query }
  // O WebResource dos Checklists de Veículos virou a aba Checklists da Frota; links antigos seguem abrindo.
  if (id === 'new_gestaochecklistsveiculos') return { id: 'frota-checklists', query }
  if (id === 'infracoes') return { id: 'frota-multas', query: new URLSearchParams([...query, ['sub', 'infracoes']]) }
  const aba = id === 'frota' ? query.get('aba') : null
  if (!aba) return null
  const rest = new URLSearchParams(query)
  rest.delete('aba')
  if (aba === 'ocorrencias') {
    const colisao = rest.get('tipo') === 'colisao'
    rest.delete('tipo')
    return { id: colisao ? 'frota-colisoes' : 'frota-multas', query: rest }
  }
  return findItem(`frota-${aba}`) ? { id: `frota-${aba}`, query: rest } : { id: 'frota', query: rest }
}

export function findItem(id: string) {
  for (const group of MENU) {
    const item = group.items.find((candidate) => candidate.id === id)
    if (item) return { group, item }
  }
  return null
}

/** Rótulo do item: sitemap, depois metadata, depois nome lógico. */
export function itemLabel(item: MenuItem, entityLabels: Map<string, string>) {
  if (item.kind !== 'entity') return item.label
  return item.label ?? entityLabels.get(item.entity) ?? item.entity
}
