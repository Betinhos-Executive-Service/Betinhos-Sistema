// Porte dos testes de contrato de UI do Tela Planner (quotesUiContract, quoteEmailComposerUi, returnUiContracts,
// contactUiContracts, boardSortUiContract, assigneeDisplay): mesmas regras, lidas dos arquivos TSX portados.
// As anotações de tipo do porte (`: any`, `as any`, `<any>`) são removidas antes de comparar, para os padrões
// continuarem descrevendo o JSX original.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const DIR = fileURLToPath(new URL('.', import.meta.url))
const strip = (source: string) => source
  .replace(/\(\(([^()]*(?:\([^()]*\))?[^()]*) as any\)\)/g, '($1)')
  .replace(/\(([\w.?$]+(?:\([^()]*\))?) as any\)/g, '$1')
  .replace(/ as any\b/g, '')
  .replace(/: any(\[\])?/g, '')
  .replace(/<any(, any)?>/g, '')
const read = (path: string) => strip(readFileSync(join(DIR, path), 'utf8'))
const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const path = join(dir, entry.name)
  if (entry.isDirectory()) return ['domain', 'data'].includes(entry.name) ? [] : walk(path)
  return /\.tsx?$/.test(entry.name) && !/\.test\./.test(entry.name) ? [path] : []
})
/** O antigo App.jsx foi dividido: casca, hook, views e componentes extraídos dele. */
const app = ['PlannerApp.tsx', 'usePlanner.ts', 'constants.ts', 'pageHelpers.ts', 'components/Badges.tsx', 'components/Dialogs.tsx',
  'components/WaitingContextFields.tsx', 'components/NotificationsPanel.tsx', 'components/PlannerAppShell.tsx', 'components/TaskSelectors.tsx',
  'components/TaskCard.tsx', 'views/BoardView.tsx', 'components/PersonalTags.tsx', 'components/FilterBar.tsx', 'views/ListView.tsx',
  'views/CalendarView.tsx', 'views/QualityView.tsx', 'views/SettingsView.tsx', 'components/attachmentFiles.ts', 'components/Attachments.tsx',
  'views/MoreView.tsx', 'components/TaskDrawer.tsx', 'components/WaitingStatusModal.tsx', 'components/WaitingReturnModal.tsx',
  'components/NewTaskDrawer.tsx'].map(read).join('\n')
const styles = readFileSync(join(DIR, 'planner.css'), 'utf8')
const dataverse = readFileSync(join(DIR, 'data/dataverse.ts'), 'utf8')
const Q = 'components/quotes/'
const quoteSources = ['views/QuotesView.tsx', `${Q}HybridQuotesView.tsx`, `${Q}QuoteCreateDrawer.tsx`, `${Q}QuoteManagementDrawer.tsx`,
  'components/TaskHistorySection.tsx', `${Q}QuoteKanban.tsx`, 'components/KanbanBoard.tsx'].map(read).join('\n')

describe('cotações (quotesUiContract)', () => {
  it('não usam prompt nativo e confirmam alterações não salvas', () => {
    expect(quoteSources.includes('window.prompt')).toBe(false)
    expect(quoteSources).toMatch(/Descartar alterações\?/)
    expect(quoteSources).toMatch(/role="alertdialog"/)
  })

  it('cadastro expõe progresso e bloqueio durante criação sem etapa de revisão', () => {
    expect(quoteSources).toMatch(/role="progressbar"/)
    expect(quoteSources).toMatch(/Criando cotação…/)
    expect(quoteSources).toMatch(/setErrors\(result\.errors\)/)
    expect(read(`${Q}QuoteCreateDrawer.tsx`)).not.toMatch(/QuoteReview|id="review"|Revisão/)
  })

  it('formulário exibe dados comerciais apenas após cotar', () => {
    const fields = read(`${Q}QuoteFields.tsx`)
    const workspace = read('views/QuotesView.tsx')
    expect(fields).toMatch(/showCommercialResult/)
    expect(fields).toMatch(/quote-value/)
    expect(fields).toMatch(/quote-commercial-terms/)
    expect(workspace).toMatch(/Informar dados comerciais/)
    expect(workspace).toMatch(/\["Cotada", "Respondida ao cliente"\]\.includes\(draft\.status\)/)
    expect(read(`${Q}HybridQuotesView.tsx`)).toMatch(/AttachmentSectionComponent[\s\S]*itemLabel="à cotação"[\s\S]*showPreview=\{false\}/)
  })

  it('condições comerciais são opcionais, mas valor continua obrigatório', () => {
    const fields = read(`${Q}QuoteFields.tsx`)
    const workspace = read('views/QuotesView.tsx')
    const hybrid = read(`${Q}HybridQuotesView.tsx`)
    expect(fields).not.toMatch(/id="quote-commercial-terms" label="Condições comerciais" required/)
    expect(fields).not.toMatch(/id="quote-commercial-terms" rows=\{?"?4"?\}? required/)
    expect(workspace).not.toMatch(/Field label="Condições comerciais" required/)
    expect(workspace).not.toMatch(/id="legacy-quote-terms" required/)
    expect(hybrid).not.toMatch(/id="quote-move-terms" required/)
    expect(app).not.toMatch(/id="quote-completion-terms"[\s\S]{0,180}\brequired/)
    expect(fields).toMatch(/id="quote-value"[^>]*required/)
    expect(app).toMatch(/conclui sozinha quando a decisão do cliente é registrada/)
    // V2: "Enviei" registra só a data; não há diálogo de canal/destinatário.
    expect(walk(DIR).some((file) => file.endsWith('QuoteSendDialog.tsx'))).toBe(false)
    expect(read(`${Q}QuoteManagementDrawer.tsx`)).toMatch(/LOSS_REASONS[\s\S]*Escolha o motivo da perda/)
  })

  it('footer do cadastro não exibe botão cancelar', () => {
    expect(read(`${Q}QuoteCreateDrawer.tsx`)).not.toMatch(/quote-v3-drawer-footer[^\n]*>.*Cancelar/)
  })

  it('contato da cotação não exibe canal e exige um meio de contato', () => {
    const fields = read(`${Q}QuoteFields.tsx`)
    expect(fields).not.toMatch(/quote-channel|label="Canal"/)
    expect(fields).toMatch(/label="Telefone \/ WhatsApp"/)
    expect(fields).toMatch(/label="E-mail"/)
    expect(read('views/QuotesView.tsx')).not.toMatch(/Canal de entrada/)
  })

  it('opção contém apenas título, condição comercial e total; data do serviço opcional', () => {
    const fields = read(`${Q}QuoteOptionsEditor.tsx`)
    expect(fields).toMatch(/Título da opção/)
    expect(fields).toMatch(/Condição comercial/)
    expect(fields).toMatch(/Valor total \(BRL\)/)
    expect(fields).not.toMatch(/Quantidade|SearchableSelect|QUOTE_VEHICLE_VALUES|Composição|Observações/)
    expect(fields).not.toMatch(/<select\b/i)
    expect(read('views/QuotesView.tsx')).not.toMatch(/Data e hora do serviço" required/)
  })

  it('kanban de cotações move por arraste sem seletor nos cards', () => {
    const kanban = read(`${Q}QuoteKanban.tsx`)
    expect(kanban).not.toMatch(/Mover para…|quote-kanban-move/)
    expect(kanban).toMatch(/onDragStart/)
    expect(kanban).toMatch(/onMove={handleBoardMove}/)
    expect(kanban).toMatch(/formatMoney\(quote\.value\)/)
    expect(kanban).toMatch(/quote-kanban-value-content/)
  })

  it('kanban de cotações replica o motor e a composição do quadro de tarefas', () => {
    const kanban = read('components/KanbanBoard.tsx')
    const quotes = read(`${Q}QuoteKanban.tsx`)
    expect(quotes).toMatch(/<KanbanBoard/)
    expect(quotes).toMatch(/className={`task-card quote-kanban-card/)
    expect(kanban).toMatch(/className="board-grid"/)
    expect(kanban).toMatch(/className={`board-column/)
    expect(kanban).toMatch(/card-drop-placeholder/)
    expect(kanban).toMatch(/ResizeObserver/)
    expect(kanban).toMatch(/requestAnimationFrame/)
  })

  it('card de cotação registra retorno pela tarefa vinculada', () => {
    const kanban = read(`${Q}QuoteKanban.tsx`)
    const hybrid = read(`${Q}HybridQuotesView.tsx`)
    expect(kanban).toMatch(/canRegisterWaitingReturn\(task, currentEmployee, teams\)/)
    expect(kanban).toMatch(/task-quick-action task-return-action/)
    expect(kanban).toMatch(/stopPropagation\(\)/)
    expect(kanban).toMatch(/onKeyDown=\{\(event\) => event\.stopPropagation\(\)\}/)
    expect(kanban).toMatch(/onAction\?\.\(quote, action\)/)
    expect(hybrid).toMatch(/action\.id === "return"[\s\S]*onRegisterWaitingReturn\?\.\(task\.id\)/)
    expect(hybrid).toMatch(/<QuoteKanban[^>]*currentEmployee=\{currentEmployee\}[^>]*teams=\{state\.teams\}[^>]*onAction=\{runCardAction\}/)
  })

  it('filtros de cotações reutilizam o multiselect da aba Tarefas', () => {
    const hybrid = read(`${Q}HybridQuotesView.tsx`)
    expect(hybrid).toMatch(/SearchableMultiSelect/)
    expect((hybrid.match(/<SearchableMultiSelect/g) || []).length).toBe(4)
  })

  it('aba de cotações mostra apenas registros sem resultado nas duas versões', () => {
    expect(read('views/QuotesView.tsx')).toMatch(/isOpenQuote/)
    expect(read(`${Q}HybridQuotesView.tsx`)).toMatch(/allQuotes\.filter\(\(quote\) => isQuoteOpen\(quote\.status\)\)/)
  })

  it('exclusão da cotação pede confirmação e alcança tarefa vinculada', () => {
    const dialog = read(`${Q}QuoteDeleteDialog.tsx`)
    expect(dialog).toMatch(/role="alertdialog"/)
    expect(dialog).toMatch(/tarefas vinculadas, incluindo subtarefas/)
    expect(dialog).toMatch(/onDelete\?\.\(quote\.id\)/)
    expect(read(`${Q}QuoteManagementDrawer.tsx`)).toMatch(/<QuoteDeleteDialog/)
    expect(read('views/QuotesView.tsx')).toMatch(/<QuoteDeleteDialog/)
    expect(dataverse).toMatch(/async function deleteLiveQuote/)
  })

  it('campos textuais usam o componente adaptado da Tela Formulário Geral', () => {
    const fields = read(`${Q}QuoteFields.tsx`)
    expect(fields).toMatch(/FormTextInput/)
    expect(fields).toMatch(/FormTextArea/)
    expect((fields.match(/<input/g) || []).length).toBe(1)
    expect((fields.match(/<textarea/g) || []).length).toBe(1)
    expect(fields).toMatch(/form-general-input/)
  })

  it('cotações não expõem nem persistem tipo de serviço', () => {
    const sources = ['views/QuotesView.tsx', `${Q}QuoteFields.tsx`, `${Q}QuoteCreateDrawer.tsx`, `${Q}QuoteManagementDrawer.tsx`,
      `${Q}QuoteKanban.tsx`, 'domain/quoteDomain.ts', 'data/mock.ts', 'data/dataverse.ts'].map(read).join('\n')
    expect(sources).not.toMatch(/serviceType|cr40f_tiposervico|tipo de serviço/i)
  })

  it('app usa o select compartilhado; nenhum <select> nativo fora do SearchableSelect', () => {
    for (const path of walk(DIR)) {
      if (path.endsWith('SearchableSelect.tsx')) continue
      expect(readFileSync(path, 'utf8'), path).not.toMatch(/<select\b/i)
    }
  })

  it('integração mantém flag V3 e carregamento sob demanda do histórico', () => {
    expect(app).toMatch(/VITE_QUOTES_HYBRID_V3/)
    expect(app).toMatch(/onEnsureTaskDetails/)
    expect(quoteSources).toMatch(/Histórico indisponível/)
  })

  it('drawer de cotação mantém opções, decisão e histórico no mesmo painel', () => {
    const drawer = read(`${Q}QuoteManagementDrawer.tsx`)
    const history = read('components/TaskHistorySection.tsx')
    const comparison = read(`${Q}QuoteOptionsComparison.tsx`)
    const editor = read(`${Q}QuoteOptionsEditor.tsx`)
    expect(drawer).toMatch(/className="quote-v3-workspace has-comparison"/)
    expect(comparison).toMatch(/className="quote-commercial-workspace"/)
    expect(drawer).toMatch(/<QuoteOptionsComparison/)
    expect(drawer).not.toMatch(/<QuoteOptionsEditor/)
    expect(comparison).toMatch(/<QuoteOptionsEditor option=\{option\}/)
    expect(drawer).not.toMatch(/comparisonOptions\.length > 1 && <QuoteOptionsComparison/)
    expect(drawer).toMatch(/onActivate=\{setActiveOptionId\}/)
    expect(comparison).toMatch(/onDecision\(option.id, "Aceita pelo cliente"\)/)
    expect(drawer).toMatch(/\{task && <TaskHistorySection history=\{task\.history\}/)
    expect(drawer).toMatch(/onMarkSent, onOutcome/)
    expect(comparison).not.toMatch(/Incluir na proposta|opções selecionadas/)
    expect(comparison).toMatch(/Montar proposta/)
    expect(comparison).not.toMatch(/Gerar cotação/)
    expect(drawer).toMatch(/const proposalSummary = prepareQuoteResponse\(draft\)/)
    expect(drawer).not.toMatch(/prepareIndividualQuoteProposal|composerOptionId|acquireMailToken|Marcar cotada/)
    expect(drawer).toMatch(/quote-stage-stepper/)
    expect(drawer).toMatch(/actions\[nextAction\.primary\.id\]/)
    expect(drawer).not.toMatch(/proposalOptionIds|Preparar proposta/)
    expect(comparison).toMatch(/validateQuoteOption\(option\)/)
    expect(comparison).not.toMatch(/description|Descrição/)
    expect(editor).toMatch(/Condição comercial/)
    expect(editor).not.toMatch(/Observações/)
    expect(drawer).toMatch(/formatQuoteOption\(option\)/)
    expect(drawer).not.toMatch(/setActiveTab\("opcoes"\)/)
    expect(styles).toMatch(/\.quote-options-comparison > header h2[^{}]*\{[^}]*color: #fff;/)
    expect(styles).toMatch(/\.quote-options-comparison-footnote[^{}]*\{[^}]*color: rgba\(255,255,255/)
    expect(history).toMatch(/Histórico da tarefa/)
    expect(history).toMatch(/Mostrar mais/)
    expect(history).toMatch(/aria-expanded=\{showHistory\}/)
  })

  it('solicitante cadastrado preenche contatos e protege dados manuais', () => {
    const fields = read(`${Q}QuoteFields.tsx`)
    expect(fields).toMatch(/clientEmail: requester\.email/)
    expect(fields).toMatch(/clientPhone: requester\.phone/)
    expect(fields).toMatch(/Manter dados atuais/)
    expect(fields).toMatch(/Usar dados do cadastro/)
    expect(dataverse).toMatch(/cr40f_email,cr40f_telefone,cr40f_classificacao,_cr40f_cliente_value/)
    expect(dataverse).not.toMatch(/cr40f_classificacao eq 202410002/)
  })
})

describe('composer de e-mail da cotação (quoteEmailComposerUi)', () => {
  it('remove destinatário e modos e mantém as ações ao lado do preview', () => {
    const source = read(`${Q}QuoteManagementDrawer.tsx`)
    expect(source).not.toMatch(/quote-v3-composer-sidebar|Preparar mensagem|id="quote-composer-email"|quote-composer-mode/)
    expect(source).toMatch(/quote-v3-composer-actions[\s\S]*Copiar para o Outlook[\s\S]*Baixar PDF[\s\S]*Baixar Word[\s\S]*Registrar envio/)
    expect(styles).toMatch(/grid-template-areas: "header" "viewport" "actions"/)
    expect(styles).not.toMatch(/quote-v3-composer-sidebar|quote-v3-composer-options/)
  })
})

describe('retornos e drawer da tarefa (returnUiContracts)', () => {
  it('drawer separa retornos de comentários e anexos gerais', () => {
    expect(app).toMatch(/<h3>Retornos<\/h3>/)
    expect(app).toMatch(/<h3>Comentários<\/h3>/)
    expect(app).toMatch(/item\.returnId/)
    expect(app).toMatch(/Abrir prévia/)
    expect(app).toMatch(/Remover \$\{attachment\.name \|\| "evidência"\}/)
    expect(app).toMatch(/Mostrar \{olderReturnsCount\}/)
    expect(styles).toMatch(/\.return-card\.is-latest/)
  })

  it('histórico da tarefa permanece como última seção do corpo do drawer', () => {
    const drawer = read('components/TaskDrawer.tsx')
    const body = drawer.slice(drawer.indexOf('<div className="drawer-body" ref={drawerBodyRef}'))
    const historyIndex = body.indexOf('<section className="drawer-section history-section">')
    const bodyEndIndex = body.search(/<\/div>\s*<footer className="drawer-footer">/)
    expect(historyIndex).toBeGreaterThanOrEqual(0)
    expect(bodyEndIndex).toBeGreaterThanOrEqual(0)
    expect(historyIndex).toBeLessThan(bodyEndIndex)
    expect(body.slice(historyIndex, bodyEndIndex).match(/<section className="drawer-section/g)?.length).toBe(1)
    expect(styles).toMatch(/\.task-drawer \.drawer-body > \.history-section \{ order: 99; \}/)
  })

  it('executor atual aparece separado do responsável', () => {
    expect(readFileSync(join(DIR, 'domain/domain.ts'), 'utf8')).toMatch(/function deriveExecutionActor/)
    expect(app).toMatch(/Em andamento por/)
    expect(app).toMatch(/Execução atual/)
    expect(dataverse).toMatch(/_cr40f_autor_value \|\| item\._createdby_value/)
  })

  it('drawer carrega detalhes uma vez por tarefa selecionada', () => {
    expect(app).toMatch(/store\.loadTaskDetails\(selectedId\)/)
    expect(app).toMatch(/task\.detailsLoaded \|\| task\.detailsLoading/)
    expect(dataverse).toMatch(/export async function loadTaskDetails/)
  })

  it('janela estreita com mouse usa a lista mobile de tarefas', () => {
    expect(app).toMatch(/const isMobile = useMediaQuery\(\s*"\(max-width: 820px\), \(max-width: 900px\) and \(max-height: 600px\)"/)
    expect(app).toMatch(/isMobile \? \(\s*<MobileTaskListView/)
    expect(app).toMatch(/<div className="mobile-task-tabs" role="tablist"/)
  })
})

describe('contatos (contactUiContracts)', () => {
  const source = read('views/ContactsView.tsx')

  it('expõe Inbox, Kanban, seção Aguardando e filtros do MVP', () => {
    expect(source).toMatch(/function ContactViewSelector\(\{ view, onChange \}\)/)
    expect(source).toMatch(/aria-label="Visualização Inbox"/)
    expect(source).toMatch(/aria-label="Visualização Kanban"/)
    expect(source).toMatch(/const \[view, setView\] = useState\("kanban"\)/)
    expect(source).toMatch(/className="contact-waiting-section"/)
    expect(source).toMatch(/CONTACT_STATUSES\.map\(\(column\)/)
    expect(source).toMatch(/data-status-id=\{column\.id\}/)
    expect(source).toMatch(/onDragOver=\{\(event\) => handleDragOver\(event, column\.id\)\}/)
    expect(source).toMatch(/onDrop=\{\(event\) => handleDrop\(event, column\.id\)\}/)
    expect(source).toMatch(/contact-kanban-drop-placeholder/)
    expect(source).toMatch(/contact-kanban-no-results/)
    expect(source).toMatch(/items\.length === 1 \? "caso" : "casos"/)
    expect(source).toMatch(/Minhas pendências/)
    expect(source).toMatch(/Arquivados/)
  })

  it('card mantém somente conclusão rápida com confirmação em dois passos', () => {
    expect(source).toMatch(/setConfirming\(true\)/)
    expect(source).toMatch(/window\.setTimeout\(\(\) => \{.*setConfirming\(false\)/s)
    expect(source).toMatch(/onComplete\(contact\)/)
    expect(source).toMatch(/className="contact-row-message"/)
    expect(source).toMatch(/aria-label=\{`Abrir caso/)
    expect(source).toMatch(/className="contact-row-date" aria-label=/)
    expect(source).not.toMatch(/onDoubleClick/)
  })

  it('Kanban mantém abertura primária e arraste sem ruído secundário', () => {
    expect(source).toMatch(/draggable = false, variant = ""/)
    expect(source).toMatch(/contact-row-main-kanban/)
    expect(source).toMatch(/contact-row-kanban-title/)
    expect(source).not.toMatch(/showMoveControl|showStatusBadge|contact-row-move|contact-row-open-hint/)
    expect(source).toMatch(/contact-priority-label priority-\$\{contact\.priority\}/)
    expect(source).toMatch(/className="contact-row-main"/)
    expect(source).toMatch(/setData\("text\/contact-id", contact\.id\)/)
    expect(source).toMatch(/effectAllowed = "move"/)
    expect(styles).toMatch(/\.contact-kanban-column\.is-drop-target \.contact-kanban-body/)
    expect(styles).toMatch(/\.contact-kanban-column \.contact-row \{ position: relative;[\s\S]*box-shadow: var\(--shadow-surface\)/)
    expect(styles).toMatch(/\.contact-kanban-column \.contacts-list \{ min-height: 0; align-content: start; \}/)
    expect(styles).toMatch(/\.contact-row-kanban-date \{ position: absolute; top: 1px; right: 1px;[\s\S]*border: 0;/)
    expect(styles).toMatch(/\.contact-row-kanban-title \{ display: -webkit-box;/)
    expect(styles).toMatch(/\.status-column-waiting \.contact-kanban-heading-title > svg \{ color: var\(--amber\); \}/)
    expect(styles).not.toMatch(/contact-row-move|contact-row-open-hint/)
  })

  it('triagem comunica busca, filtros ativos e estados da lista', () => {
    expect(source).toMatch(/const activeFilterCount =/)
    expect(source).toMatch(/aria-expanded=\{filterOpen\}/)
    expect(source).toMatch(/aria-controls="contacts-filter-options"/)
    expect(source).toMatch(/aria-label=\{`\$\{activeFilterCount\} filtros ativos`\}/)
    expect(source).toMatch(/id="contacts-filter-options"/)
    expect(source).toMatch(/disabled=\{!activeFilterCount\}/)
    expect(styles).toMatch(/\.contacts-filter-bar \.filter-bar-content \{ display: none;/)
    expect(styles).toMatch(/\.contacts-filter-bar\.is-expanded \.filter-bar-content \{ display: flex;/)
    expect(styles).toMatch(/\.contacts-filter-bar \.filter-search \{ min-width:/)
    expect(styles).toMatch(/\.contact-row-message \{ min-width:/)
    expect(styles).toMatch(/@media \(max-width: 720px\) \{[\s\S]*\.contacts-filter-bar \.filter-search \{ grid-column: 1; grid-row: 1;/)
  })

  it('drawer reutiliza responsáveis, contatos alternativos e anexos', () => {
    expect(source).toMatch(/<AssignmentFields form=\{draft\}/)
    expect(source).not.toMatch(/<SearchableSelect value=\{draft\.channel\}/)
    expect(source).toMatch(/aria-label="Telefone do remetente"/)
    expect(source).toMatch(/aria-label="E-mail do remetente"/)
    expect(source).toMatch(/validateContact\(draft\)/)
    expect(source).toMatch(/AttachmentSectionComponent/)
    expect(source).toMatch(/MAX_CONTACT_ATTACHMENT_SIZE = 5 \* 1024 \* 1024/)
    expect(styles).toMatch(/@media \(max-width: 820px\) \{[\s\S]*\.contact-kanban/)
    expect(styles).toMatch(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*\.contact-complete-action/)
  })
})

describe('quadro de tarefas (boardSortUiContract, assigneeDisplay)', () => {
  it('rótulos do quadro correspondem à direção real do comparador', () => {
    expect(app).toMatch(/\["dueDate", "Prazo", "Mais próximo primeiro", "Mais distante primeiro"\]/)
    expect(app).toMatch(/\["priority", "Prioridade", "Mais alta primeiro", "Mais baixa primeiro"\]/)
    expect(app).toMatch(/\["updatedAt", "Atualização", "Mais antiga primeiro", "Mais recente primeiro"\]/)
    expect(app).toMatch(/\["createdAt", "Criação", "Mais antiga primeiro", "Mais recente primeiro"\]/)
    expect(app).toMatch(/\["title", "Título", "A–Z", "Z–A"\]/)
  })

  it('mantém a pilha de responsáveis horizontal na Central', () => {
    const stackRule = styles.match(/\.central-row-meta \.avatar-stack\s*\{([^}]*)\}/)?.[1] || ''
    expect(stackRule).toMatch(/display:\s*inline-flex/)
  })
})

describe('CSS do Planner no shell', () => {
  it('não usa gradiente e fica escopado em .planner-page/.planner-portal', () => {
    expect(styles).not.toMatch(/gradient\(/)
    const selectors = styles.replace(/\/\*[\s\S]*?\*\//g, '').match(/(^|\})\s*([^{}@]+)\{/g) || []
    for (const raw of selectors) {
      const selector = raw.replace(/^\}?\s*/, '').replace(/\{$/, '').trim()
      if (!selector || /^(from|to|\d+%)/.test(selector)) continue
      for (const part of selector.split(':where(.planner-page, .planner-portal)').join('§').split(/,(?![^(]*\))/)) expect(part.trim(), selector).toMatch(/^§/)
    }
  })
})
