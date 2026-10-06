import { expect, it } from 'vitest'
import { tableTemplates, type TableColumn } from './Table'

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

