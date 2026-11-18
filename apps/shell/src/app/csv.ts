type Cell = string | number | null

function cell(value: Cell) {
  if (value === null) return ''
  const text = typeof value === 'number' ? String(value).replace('.', ',') : value
  return /[;"\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** CSV para Excel pt-BR: BOM UTF-8, separador ponto e vírgula, vírgula decimal, CRLF. */
export function toCsv(headers: string[], rows: Cell[][]) {
  return `﻿${[headers, ...rows].map((row) => row.map(cell).join(';')).join('\r\n')}\r\n`
}

export function downloadCsv(filename: string, csv: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
