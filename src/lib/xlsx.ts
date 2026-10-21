// Arma un archivo de Excel (.xlsx) en el navegador, sin librerías: un .xlsx es un zip con unos XML adentro.
// Alcanza para exportar tablas: texto y números, varias hojas, formatos de moneda y porcentaje (los valores siguen
// siendo números, así que se pueden sumar), encabezados con fondo, títulos, anchos de columna y la fila de títulos fija.

// Formato de una celda. Los números se guardan tal cual y Excel los muestra con el formato:
// money "$ 195.000" · pct 0,92 → "92%" · delta 0,18 → "+18%" · points 3 → "+3 pts" · decimal "0,4" · days "3 días"
export type CellStyle = 'money' | 'pct' | 'delta' | 'points' | 'date' | 'decimal' | 'days' | 'bold' | 'title' | 'note' | 'section'
export type Cell = string | number | null | undefined | { value: string | number | null | undefined; style: CellStyle }
export type Sheet = {
  name: string
  rows: Cell[][]
  widths?: number[]
  headers?: number[] // filas de encabezado de tabla (negrita, fondo gris y línea abajo)
  columns?: (CellStyle | undefined)[] // formato por columna para los números que no traen el suyo
  freeze?: number // cuántas filas quedan fijas arriba al bajar
}

// Índice de cada estilo en styles.xml (cellXfs)
const STYLE_INDEX: Record<CellStyle | 'header', number> = {
  bold: 1, header: 2, title: 3, money: 4, pct: 5, delta: 6, decimal: 7, days: 8, note: 9, section: 10, points: 11, date: 12,
}

const escapeXml = (text: string) => text
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  // Excel no acepta caracteres de control en el XML
  // eslint-disable-next-line no-control-regex
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')

function columnName(index: number) {
  let name = ''
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name
  return name
}

function sheetXml(sheet: Sheet) {
  const headers = new Set(sheet.headers ?? [])
  const width = Math.max(1, ...sheet.rows.map(row => row.length), sheet.widths?.length ?? 0)
  const cols = sheet.widths?.length
    ? `<cols>${sheet.widths.map((w, index) => `<col min="${index + 1}" max="${index + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`
    : ''
  const freeze = sheet.freeze
    ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${sheet.freeze}" topLeftCell="A${sheet.freeze + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`
    : '<sheetViews><sheetView workbookViewId="0"/></sheetViews>'
  const rows = sheet.rows.map((row, rowIndex) => {
    const isHeader = headers.has(rowIndex)
    // El encabezado pinta todas las columnas de la tabla, aunque alguna celda venga vacía
    const length = isHeader ? Math.max(row.length, width) : row.length
    const cells = Array.from({ length }, (_, colIndex) => {
      const raw = row[colIndex]
      const explicit = raw !== null && typeof raw === 'object' ? raw : null
      const value = explicit ? explicit.value : raw as Exclude<Cell, object>
      const ref = `${columnName(colIndex)}${rowIndex + 1}`
      const styleName = isHeader ? 'header'
        : explicit?.style ?? (typeof value === 'number' ? sheet.columns?.[colIndex] : undefined)
      const style = styleName ? ` s="${STYLE_INDEX[styleName]}"` : ''
      if (value === null || value === undefined || value === '') return isHeader ? `<c r="${ref}"${style}/>` : ''
      if (typeof value === 'number' && Number.isFinite(value)) return `<c r="${ref}"${style}><v>${value}</v></c>`
      return `<c r="${ref}" t="inlineStr"${style}><is><t xml:space="preserve">${escapeXml(String(value))}</t></is></c>`
    }).join('')
    const height = row.some(cell => cell !== null && typeof cell === 'object' && cell.style === 'title') ? ' ht="24" customHeight="1"' : ''
    return `<row r="${rowIndex + 1}"${height}>${cells}</row>`
  }).join('')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${freeze}${cols}<sheetData>${rows}</sheetData></worksheet>`
}

// Nombres de hoja válidos para Excel: hasta 31 caracteres, sin : \ / ? * [ ] y sin repetirse
function sheetNames(sheets: Sheet[]) {
  const used = new Set<string>()
  return sheets.map(sheet => {
    const base = sheet.name.replace(/[:\\/?*[\]]/g, ' ').slice(0, 31).trim() || 'Hoja'
    let name = base
    for (let n = 2; used.has(name.toLowerCase()); n += 1) name = `${base.slice(0, 28)} ${n}`
    used.add(name.toLowerCase())
    return name
  })
}

// ── Zip sin compresión (método "store"), suficiente para un .xlsx ─────────────
const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(data: Uint8Array) {
  let crc = 0xffffffff
  for (let i = 0; i < data.length; i += 1) crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function zip(files: { name: string; content: string }[]): Blob {
  const encoder = new TextEncoder()
  const chunks: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0
  for (const file of files) {
    const name = encoder.encode(file.name)
    const data = encoder.encode(file.content)
    const crc = crc32(data)
    const local = new DataView(new ArrayBuffer(30))
    local.setUint32(0, 0x04034b50, true)
    local.setUint16(4, 20, true)
    local.setUint16(6, 0x0800, true) // nombres en UTF-8
    local.setUint16(8, 0, true) // sin compresión
    local.setUint32(14, crc, true)
    local.setUint32(18, data.length, true)
    local.setUint32(22, data.length, true)
    local.setUint16(26, name.length, true)
    chunks.push(new Uint8Array(local.buffer), name, data)

    const entry = new DataView(new ArrayBuffer(46))
    entry.setUint32(0, 0x02014b50, true)
    entry.setUint16(4, 20, true)
    entry.setUint16(6, 20, true)
    entry.setUint16(8, 0x0800, true)
    entry.setUint32(16, crc, true)
    entry.setUint32(20, data.length, true)
    entry.setUint32(24, data.length, true)
    entry.setUint16(28, name.length, true)
    entry.setUint32(42, offset, true)
    central.push(new Uint8Array(entry.buffer), name)
    offset += 30 + name.length + data.length
  }
  const centralSize = central.reduce((sum, part) => sum + part.length, 0)
  const end = new DataView(new ArrayBuffer(22))
  end.setUint32(0, 0x06054b50, true)
  end.setUint16(8, files.length, true)
  end.setUint16(10, files.length, true)
  end.setUint32(12, centralSize, true)
  end.setUint32(16, offset, true)
  return new Blob([...chunks, ...central, new Uint8Array(end.buffer)] as BlobPart[], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

// Formatos de número (moneda, porcentaje, variación con signo, decimal, días), fuentes (normal, negrita, título,
// nota en gris, subtítulo), un fondo gris y una línea fina para los encabezados. El orden de cellXfs es STYLE_INDEX.
const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="6"><numFmt numFmtId="164" formatCode="&quot;$ &quot;#,##0"/><numFmt numFmtId="165" formatCode="0%"/><numFmt numFmtId="166" formatCode="+0%;-0%;0%"/><numFmt numFmtId="167" formatCode="0.0"/><numFmt numFmtId="168" formatCode="0.0 &quot;días&quot;"/><numFmt numFmtId="169" formatCode="+0 &quot;pts&quot;;-0 &quot;pts&quot;;0 &quot;pts&quot;"/></numFmts><fonts count="5"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="15"/><name val="Calibri"/></font><font><i/><sz val="10"/><color rgb="FF595959"/><name val="Calibri"/></font><font><b/><sz val="12"/><color rgb="FF262626"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF2F2F2"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top/><bottom style="thin"><color rgb="FFBFBFBF"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="13"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="167" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="168" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="169" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs></styleSheet>`

// Fecha de Excel (número de días desde el 30/12/1899): así se puede ordenar y filtrar como fecha
export function excelDate(year: number, month: number, day: number) {
  return (Date.UTC(year, month - 1, day) - Date.UTC(1899, 11, 30)) / 86_400_000
}

export function buildXlsx(sheets: Sheet[]): Blob {
  const names = sheetNames(sheets)
  const files = [
    { name: '[Content_Types].xml', content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>` },
    { name: '_rels/.rels', content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { name: 'xl/workbook.xml', content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names.map((name, index) => `<sheet name="${escapeXml(name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('')}</sheets></workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { name: 'xl/styles.xml', content: STYLES_XML },
    ...sheets.map((sheet, index) => ({ name: `xl/worksheets/sheet${index + 1}.xml`, content: sheetXml(sheet) })),
  ]
  return zip(files)
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 2000)
}
