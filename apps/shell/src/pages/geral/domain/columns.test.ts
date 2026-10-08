import { describe, expect, it } from 'vitest'
import { STORAGE_KEY, applyColumnPrefs, loadColumnPrefs, saveColumnPrefs } from './columns'
import { COPY_SELECT, copyText } from './copy'
import type { Column } from './types'

const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v) }, removeItem: (k: string) => { m.delete(k) } } }
const col = (key: string): Column => ({ key, attribute: key, alias: null, entity: null, width: 100 })
const F = '@OData.Community.Display.V1.FormattedValue'

describe('colunas', () => {
  it('salva e lê por visão, ignorando lixo', () => {
    const kv = mem()
    saveColumnPrefs(kv, 'v1', { hidden: ['b'], order: ['c', 'a'] })
    expect(loadColumnPrefs(kv, 'v1')).toEqual({ hidden: ['b'], order: ['c', 'a'] })
    expect(loadColumnPrefs(kv, 'v2')).toBeNull()
    kv.setItem(STORAGE_KEY, '{"v3": {"hidden": "x", "order": [1]}}')
    expect(loadColumnPrefs(kv, 'v3')).toBeNull()
    kv.setItem(STORAGE_KEY, 'não é json')
    expect(loadColumnPrefs(kv, 'v1')).toBeNull()
    saveColumnPrefs(kv, 'v1', null)
    expect(kv.getItem(STORAGE_KEY)).toBe('{}')
  })
  it('aplica ordem e ocultas; colunas novas da visão entram no fim', () => {
    const cols = [col('a'), col('b'), col('c'), col('d')]
    expect(applyColumnPrefs(cols, { hidden: ['b'], order: ['c', 'a'] }).map((c) => c.key)).toEqual(['c', 'a', 'd'])
    expect(applyColumnPrefs(cols, null).map((c) => c.key)).toEqual(['a', 'b', 'c', 'd'])
    expect(applyColumnPrefs(cols, { hidden: ['a', 'b', 'c', 'd'], order: [] }).map((c) => c.key)).toEqual(['a'])
  })
})

describe('copyText', () => {
  it('monta o mesmo bloco do script Copiar Serviços, ordenado por data', () => {
    const rows = [
      { cr40f_dataehorriodesada: '2026-10-09T13:30:00Z', cr40f_id: 'OS-2', _cr40f_cliente_value: 'x', [`_cr40f_cliente_value${F}`]: 'Tenaris', cr40f_receber: false, cr40f_trajeto: 'GRU → Hotel' },
      { cr40f_dataehorriodesada: '2026-10-08T19:00:00Z', cr40f_id: 'OS-1', cr40f_receber: true, cr40f_trajeto: null, cr40f_passageirosetelefonedecontato: 'Ana (11) 9', cr40f_endereodesada: 'Rua A', cr40f_destino: 'Rua B', cr40f_obsdeoperao: 'Placa', cr40f_perfildopassageiro: 'VIP' },
    ]
    expect(copyText(rows)).toBe([
      '*Data:* 08/10/2026 16:00', '*ID:* OS-1', '*Horário:* 16:00', '*Cliente:* —', '*Receber:* ✓', '*Trajeto:* —', '*Passageiro:* Ana (11) 9',
      '*Local de saída:* Rua A', '*Destino:* Rua B', '*Obs ao motorista:* Placa', '*Perfil do Passageiro:* VIP',
      '',
      '*Data:* 09/10/2026 10:30', '*ID:* OS-2', '*Horário:* 10:30', '*Cliente:* Tenaris', '*Receber:* ✗', '*Trajeto:* GRU → Hotel', '*Passageiro:* —',
      '*Local de saída:* —', '*Destino:* —', '*Obs ao motorista:* —', '*Perfil do Passageiro:* —',
    ].join('\n'))
    expect(COPY_SELECT).toContain('_cr40f_cliente_value')
    expect(copyText([])).toBe('')
  })
})
