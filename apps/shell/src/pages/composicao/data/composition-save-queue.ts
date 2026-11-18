import type { ApplyCellInputResult, CellInput, Composition, MoneyField } from './compositions'

type Source = 'dataverse' | 'mock'
type Save = (row: Composition, field: MoneyField, input: CellInput, source: Source) => Promise<ApplyCellInputResult>

function applyResult(row: Composition, result: ApplyCellInputResult): Composition {
  const formulas = { ...row.formulas }
  for (const [field, formula] of Object.entries(result.formulas)) {
    if (formula === null) delete formulas[field as MoneyField]
    else if (formula) formulas[field as MoneyField] = formula
  }
  return { ...row, values: { ...row.values, ...result.updatedValues }, formulas, rowVersion: result.rowVersion }
}

export class CompositionSaveQueue {
  private readonly pending = new Map<string, Promise<Composition>>()
  private readonly latest = new Map<string, Composition>()

  constructor(private readonly save: Save) {}

  enqueue(row: Composition, field: MoneyField, input: CellInput, source: Source): Promise<Composition> {
    const previous = this.pending.get(row.id)
    const operation = (async () => {
      const base = previous ? await previous : this.latest.get(row.id) ?? row
      const updated = applyResult(base, await this.save(base, field, input, source))
      this.latest.set(row.id, updated)
      return updated
    })()
    this.pending.set(row.id, operation)
    void operation.then(
      () => { if (this.pending.get(row.id) === operation) this.pending.delete(row.id) },
      () => { if (this.pending.get(row.id) === operation) this.pending.delete(row.id) },
    )
    return operation
  }

  reset() { this.latest.clear() }

  sync(row: Composition) { this.latest.set(row.id, row) }
}
