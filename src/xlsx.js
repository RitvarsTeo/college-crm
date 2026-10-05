// A real Excel workbook (.xlsx, Office Open XML), with no dependency.
//
// An .xlsx is a zip of a few XML parts. The zip is written here with node:zlib for
// the compression and a CRC-32 table for the checksums, which is all the format asks
// for. One sheet, text kept as text (a phone number or "0012" never turns into a
// number), numbers kept as numbers, and the rows the caller marks shown in bold.
// Excel, LibreOffice and Google Sheets all open it; Google Drive also converts it
// into a native Google Sheet, which is how the Google Sheets export is made.

import zlib from 'node:zlib';

// ---------------------------------------------------------------- the zip --
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
export function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

// DOS date and time, which is what a zip entry carries.
function dosStamp(d) {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}

export function zip(files, now = new Date()) {
  const { time, date } = dosStamp(now);
  const locals = []; const centrals = []; let offset = 0;
  for (const { name, data } of files) {
    const raw = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
    const packed = zlib.deflateRawSync(raw);
    const fname = Buffer.from(name, 'utf8');
    const crc = crc32(raw);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8); local.writeUInt16LE(time, 10); local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(packed.length, 18); local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(fname.length, 26); local.writeUInt16LE(0, 28);
    locals.push(local, fname, packed);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8); central.writeUInt16LE(8, 10); central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14); central.writeUInt32LE(crc, 16); central.writeUInt32LE(packed.length, 20);
    central.writeUInt32LE(raw.length, 24); central.writeUInt16LE(fname.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, fname);
    offset += local.length + fname.length + packed.length;
  }
  const cdSize = centrals.reduce((a, b) => a + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cdSize, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}

// ------------------------------------------------------------- the sheet --
// XML 1.0 cannot carry most control characters at all, so they are dropped rather
// than breaking the whole file.
const xml = (s) => String(s)
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const colName = (i) => { let s = ''; let n = i + 1; while (n) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };

function sheetXml(rows, bold, widths) {
  const out = [];
  rows.forEach((row, r) => {
    const cells = (row || []).map((v, c) => {
      if (v === null || v === undefined || v === '') return '';
      const ref = colName(c) + (r + 1);
      const s = bold.has(r) ? ' s="1"' : '';
      if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}"${s}><v>${v}</v></c>`;
      return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${xml(v)}</t></is></c>`;
    }).join('');
    out.push(`<row r="${r + 1}">${cells}</row>`);
  });
  const cols = widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('');
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
    + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + (cols ? `<cols>${cols}</cols>` : '') + `<sheetData>${out.join('')}</sheetData></worksheet>`;
}

/**
 * rows: an array of arrays (strings and numbers). opts.bold: row indexes to embolden.
 * Returns the .xlsx file as a Buffer.
 */
export function rowsToXlsx(rows, { sheetName = 'Report', bold = [], title = 'Report', now = new Date() } = {}) {
  const boldSet = new Set(bold);
  const width = Math.max(1, ...rows.map((r) => (r || []).length));
  const widths = Array.from({ length: width }, (_, c) => Math.min(60, Math.max(10,
    ...rows.map((r) => String((r || [])[c] ?? '').length + 2))));
  const name = xml(String(sheetName).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Report');
  const stamp = now.toISOString().replace(/\.\d+Z$/, 'Z');
  const head = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  return zip([
    { name: '[Content_Types].xml', data: head + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
      + '<Default Extension="xml" ContentType="application/xml"/>'
      + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
      + '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
      + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
      + '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>'
      + '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>'
      + '</Types>' },
    { name: '_rels/.rels', data: head + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
      + '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>'
      + '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>'
      + '</Relationships>' },
    { name: 'docProps/core.xml', data: head + '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'
      + `<dc:title>${xml(title)}</dc:title><dc:creator>Novikontas Intake</dc:creator>`
      + `<dcterms:created xsi:type="dcterms:W3CDTF">${stamp}</dcterms:created></cp:coreProperties>` },
    { name: 'docProps/app.xml', data: head + '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Novikontas Intake</Application></Properties>' },
    { name: 'xl/workbook.xml', data: head + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
      + `<sheets><sheet name="${name}" sheetId="1" r:id="rId1"/></sheets></workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', data: head + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
      + '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
      + '</Relationships>' },
    { name: 'xl/styles.xml', data: head + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
      + '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>'
      + '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>'
      + '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
      + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
      + '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>'
      + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>' },
    { name: 'xl/worksheets/sheet1.xml', data: sheetXml(rows, boldSet, widths) },
  ], now);
}

export const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
