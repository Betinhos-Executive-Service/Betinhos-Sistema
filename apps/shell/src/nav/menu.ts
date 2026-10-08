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
  | { kind: 'page'; id: string; label: string; page: 'componentes' | 'operacional' | 'frota' | 'funcionarios' | 'curriculos' | 'pagantes' | 'pessoas' | 'dashboard' }

export type MenuGroup = { id: string; label: string; items: MenuItem[] }

const wr = (label: string, resource: string): MenuItem => ({ kind: 'webresource', id: resource.replace(/\.html$/i, '').toLowerCase(), label, resource })
const table = (entity: string, label?: string): MenuItem => ({ kind: 'entity', id: entity, entity, label })

export const MENU: MenuGroup[] = [
  {
    id: 'inicio',
    label: 'Início',
    items: [wr('Página Inicial', 'cr40f_HomeBetinhos.html')],
  },
  {
    id: 'operacional',
    label: 'Operacional',
    items: [
      table('cr40f_reservadeveculos'),
      { kind: 'page', id: 'dashboard', label: 'Dashboard', page: 'dashboard' },
      wr('Dashboard (completo)', 'new_dashboard'),
      { kind: 'page', id: 'operacional', label: 'Resumo Operacional', page: 'operacional' },
      wr('Funções Operacionais', 'new_telafuncoesoperacionais'),
      table('cr40f_trocasdecarro'),
      table('new_possedeveiculo'),
      wr('Gestão de Qualidade', 'new_gestao_erros_operacionais.html'),
      { kind: 'external', id: 'infleet', label: 'Infleet', url: 'https://app.infleet.com.br/monitoring' },
      wr('Planner', 'new_TelaPlanner.html'),
    ],
  },
  {
    id: 'financeiro',
    label: 'Financeiro',
    items: [
      table('cr40f_composicaodeprecos'),
      table('cr40f_financeiro'),
      { kind: 'page', id: 'pagantes', label: 'Pagantes', page: 'pagantes' },
      table('cr40f_recibos_v2'),
      table('cr40f_pedidodecotacao'),
      wr('Pagamento de Fornecedores', 'cr40f_TelaPagamentoFornecedores.html'),
      wr('Fluxo de Caixa', 'cr40f_TelaFluxoDeCaixa.html'),
    ],
  },
  {
    id: 'frota',
    label: 'Frota',
    items: [{ kind: 'page', id: 'frota', label: 'Painel da Frota', page: 'frota' }, table('cr40f_manutencoes'), table('cr40f_multas'), table('cr40f_colisao_v2')],
  },
  {
    id: 'cadastros',
    label: 'Cadastros',
    items: [
      { kind: 'page', id: 'pessoas', label: 'Pessoas', page: 'pessoas' },
      table('cr40f_clientes1', 'Clientes'),
      table('cr40f_veiculos'),
      { kind: 'page', id: 'funcionarios', label: 'Funcionários', page: 'funcionarios' },
      { kind: 'page', id: 'curriculos', label: 'Currículos', page: 'curriculos' },
      table('cr40f_infracaodetransito'),
      table('new_marketing'),
    ],
  },
  {
    id: 'back-end',
    label: 'Back-End',
    items: [
      table('cr40f_servicosporpassageiro'),
      wr('Despesas Operacionais', 'new_teladespesasoperacionais'),
      table('new_fotomanutencao'),
      table('new_appmotoristaslog'),
      table('cr40f_anexodespesaoperacional'),
      table('cr40f_categoriadespesaoperacional'),
      table('cr40f_despesaoperacional'),
      table('cr40f_formapagamentodespesa'),
      table('cr40f_anexocolisao_v2'),
      table('cr40f_anexorecebimento_v2'),
      { kind: 'unavailable', id: 'custom-page-funcoes-operacionais', label: 'Funções Operacionais (página personalizada)', reason: 'Esta página personalizada só abre pelo menu do app model-driven.' },
      wr('Comunicados', 'cr40f_GerenciarComunicados.html'),
      wr('Composição de Preço', 'new_TelaComposicaoPreco.html'),
    ],
  },
  // Referência para quem desenvolve: só existe no `pnpm dev`, nunca no build publicado.
  ...(import.meta.env.DEV
    ? [{ id: 'design-system', label: 'Design System', items: [{ kind: 'page', id: 'componentes', label: 'Componentes', page: 'componentes' }] } satisfies MenuGroup]
    : []),
]

export const ALL_ITEMS = MENU.flatMap((group) => group.items)
export const ENTITY_NAMES = ALL_ITEMS.flatMap((item) => (item.kind === 'entity' ? [item.entity] : []))
export const DEFAULT_ITEM = MENU[0].items[0]

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
