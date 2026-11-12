/** Rótulo de exibição de cada valor bruto da coluna (ex.: nome da opção de um status), lido uma vez por coluna. */
export function createColumnFilterLabels<T>(rows: readonly T[]) {
  const columns = new Map<string, Map<string, string>>()
  return (id: string, value: (row: T) => string, label: (row: T) => unknown) => {
    let labels = columns.get(id)
    if (!labels) {
      labels = new Map()
      for (const row of rows) {
        const raw = value(row)
        const text = label(row)
        if (raw && !labels.has(raw) && typeof text === 'string' && text) labels.set(raw, text)
      }
      columns.set(id, labels)
    }
    return (raw: string) => labels.get(raw) ?? raw
  }
}
