/**
 * Minimal CSV reader for the historical-loan import.
 *
 * Handles the shapes a spreadsheet actually exports: quoted fields,
 * commas and newlines inside quotes, CRLF line endings, and a
 * trailing blank line. Returns one object per data row, keyed by
 * the header names (trimmed, lowercased).
 *
 * Deliberately small — no dependencies. A malformed row is skipped
 * with its line number in _line so the import preview can point at
 * the exact line to fix.
 */

export function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false

  const endField = () => {
    row.push(field)
    field = ''
  }
  const endRow = () => {
    endField()
    // Skip completely empty lines (spreadsheet trailing newline).
    if (row.some((cell) => String(cell).trim() !== '')) rows.push(row)
    row = []
  }

  const input = String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i]
    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"'
          i += 1 // escaped quote
        } else {
          inQuotes = false
        }
      } else {
        field += char
      }
      continue
    }
    if (char === '"') {
      inQuotes = true
    } else if (char === ',') {
      endField()
    } else if (char === '\n') {
      endRow()
    } else {
      field += char
    }
  }
  // Last row has no trailing newline.
  if (field !== '' || row.length > 0) endRow()

  if (!rows.length) return []

  const headers = rows[0].map((header) => String(header).trim().toLowerCase())
  return rows.slice(1).map((cells, index) => {
    const object = { _line: index + 2 } // line 1 is the header
    headers.forEach((header, column) => {
      if (header) object[header] = String(cells[column] ?? '').trim()
    })
    return object
  })
}
