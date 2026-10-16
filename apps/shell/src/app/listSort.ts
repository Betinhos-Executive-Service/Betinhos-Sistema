/** Ordena uma lista pela chave dada; vazios (null, '') ficam por último nos dois sentidos. */
export function sortRows<T>(list: T[], value: (row: T) => string | number | null | undefined, dir: 'asc' | 'desc') {
  const sign = dir === 'asc' ? 1 : -1
  const isEmpty = (v: unknown) => v == null || v === ''
  return [...list].sort((a, b) => {
    const x = value(a)
    const y = value(b)
    if (isEmpty(x) || isEmpty(y)) return isEmpty(x) === isEmpty(y) ? 0 : isEmpty(x) ? 1 : -1
    const diff = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'pt-BR')
    return diff * sign
  })
}
