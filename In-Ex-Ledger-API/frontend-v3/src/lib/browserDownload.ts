export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export function csvCell(value: unknown) {
  const text = String(value ?? '')
  if (!/[",\n\r]/.test(text)) {
    return text
  }
  return `"${text.replace(/"/g, '""')}"`
}

export function buildCsv(rows: unknown[][]) {
  return rows.map((row) => row.map(csvCell).join(',')).join('\n')
}

export function downloadCsv(rows: unknown[][], filename: string) {
  downloadBlob(new Blob([buildCsv(rows)], { type: 'text/csv;charset=utf-8' }), filename)
}
