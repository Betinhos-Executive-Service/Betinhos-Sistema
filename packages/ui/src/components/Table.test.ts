import { expect, it } from 'vitest'
import { tableTemplates, tableViewColumns, viewLayout, type TableColumn } from './Table'

const col = (key: string, extra: Partial<TableColumn<unknown>> = {}): TableColumn<unknown> => ({ key, header: key, cell: () => null, ...extra })

it('tira da faixa compacta só as trilhas das colunas hideBelow compact', () => {
  const columns = [
    col('placa', { width: 'minmax(150px, 1.2fr)' }),
    col('categoria', { hideBelow: 'compact' }),
    col('status', { width: '96px' }),
    col('motorista', { hideBelow: 'mobile' }),
    col('custo', { width: '120px', hideBelow: 'compact' }),
  ]
  expect(tableTemplates(columns, false)).toEqual({
    full: 'minmax(150px, 1.2fr) minmax(0, 1fr) 96px minmax(0, 1fr) 120px',
    compact: 'minmax(150px, 1.2fr) 96px minmax(0, 1fr)',
  })
})

it('mantém a trilha da seta nas duas faixas quando a linha é clicável', () => {
  const columns = [col('a'), col('b', { hideBelow: 'compact' })]
  expect(tableTemplates(columns, true)).toEqual({ full: 'minmax(0, 1fr) minmax(0, 1fr) 24px', compact: 'minmax(0, 1fr) 24px' })
})


it('com visão: só as visíveis, na ordem da visão, em px, com a última trilha esticando', async () => {
  const { defaultConfig, resizeColumn, toggleColumn, moveVisibleColumn } = await import('../tableView/config')
  const columns = [col('nome', { label: 'Nome' }), col('status'), col('obs', { defaultHidden: true, defaultWidth: 300 }), col('valor', { header: 'Valor (R$)' })]
  const defs = tableViewColumns(columns)
  expect(defs.map((d) => d.label)).toEqual(['Nome', 'status', 'obs', 'Valor (R$)'])
  let config = defaultConfig(defs)
  expect(viewLayout(columns, config, false).template).toBe('240px 160px 160px minmax(0, 1fr)')
  config = resizeColumn(toggleColumn(config, defs, 'obs'), 'status', 120)
  config = moveVisibleColumn(config, defs, 'valor', 1)
  const layout = viewLayout(columns, config, true)
  expect(layout.placed.map((p) => p.column.key)).toEqual(['nome', 'valor', 'status', 'obs'])
  expect(layout.template).toBe('240px 160px 120px 300px minmax(24px, 1fr)')
})
