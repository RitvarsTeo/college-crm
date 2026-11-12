// THE TICKET QR (12.11.2026, his pick "QR + calendar now" for the Stage 3 ticket): a small QR encoder with no outside
// package. Byte mode, error correction level M, versions 1 to 5 (up to 84 characters; a ticket code is 15), the eight masks
// scored and the best one kept. qrPng() draws it as a PNG for the email (Gmail shows no SVG); test/tc_go_tickets proves a
// real QR reader reads every code back. Built the standard way (ISO/IEC 18004), as in Project Nayuki's reference encoder.
import zlib from 'node:zlib';

// version 1-5 at level M: total codewords, error correction codewords per block, number of blocks (all blocks equal here)
const SPEC = [null, [26, 10, 1], [44, 16, 1], [70, 26, 1], [100, 18, 2], [134, 24, 2]];
const ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30]];

const mul = (x, y) => { let z = 0; for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11d); z ^= ((y >>> i) & 1) * x; } return z & 0xff; };
function divisor(n) {
  const r = Array(n).fill(0); r[n - 1] = 1; let root = 1;
  for (let i = 0; i < n; i++) { for (let j = 0; j < n; j++) { r[j] = mul(r[j], root); if (j + 1 < n) r[j] ^= r[j + 1]; } root = mul(root, 2); }
  return r;
}
function remainder(data, div) {
  const r = Array(div.length).fill(0);
  for (const b of data) { const f = b ^ r.shift(); r.push(0); for (let i = 0; i < div.length; i++) r[i] ^= mul(div[i], f); }
  return r;
}

/** The QR as rows of true (dark) / false, for the text given. */
export function qrMatrix(text) {
  const bytes = [...Buffer.from(String(text), 'utf8')];
  let ver = 1;
  for (; ver <= 5; ver++) { const [tot, ec, nb] = SPEC[ver]; if (4 + 8 + bytes.length * 8 <= (tot - ec * nb) * 8) break; }
  if (ver > 5) throw new Error('Too long for a ticket QR.');
  const [tot, ecLen, nb] = SPEC[ver], dataLen = tot - ecLen * nb, size = ver * 4 + 17;
  // the data bits: byte mode, the count, the bytes, the end, the pad bytes
  const bits = [];
  const put = (v, n) => { for (let i = n - 1; i >= 0; i--) bits.push((v >>> i) & 1); };
  put(4, 4); put(bytes.length, 8); for (const b of bytes) put(b, 8);
  put(0, Math.min(4, dataLen * 8 - bits.length)); while (bits.length % 8) bits.push(0);
  const data = []; for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(''), 2));
  for (let p = 0xec; data.length < dataLen; p ^= 0xec ^ 0x11) data.push(p);
  // the blocks and their error correction, interleaved
  const per = dataLen / nb, div = divisor(ecLen), blocks = [];
  for (let b = 0; b < nb; b++) { const d = data.slice(b * per, (b + 1) * per); blocks.push([d, remainder(d, div)]); }
  const words = [];
  for (let i = 0; i < per; i++) for (const [d] of blocks) words.push(d[i]);
  for (let i = 0; i < ecLen; i++) for (const [, e] of blocks) words.push(e[i]);
  // the fixed patterns
  const m = Array.from({ length: size }, () => Array(size).fill(false));
  const fn = Array.from({ length: size }, () => Array(size).fill(false));
  const set = (x, y, dark) => { m[y][x] = dark; fn[y][x] = true; };
  for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  const finder = (cx, cy) => { for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const x = cx + dx, y = cy + dy, d = Math.max(Math.abs(dx), Math.abs(dy));
    if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, d !== 2 && d !== 4); } };
  finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
  const al = ALIGN[ver];
  for (const ay of al) for (const ax of al) {
    if ((ax === 6 && ay === 6) || (ax === 6 && ay === al[al.length - 1]) || (ax === al[al.length - 1] && ay === 6)) continue;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }
  const format = (mask) => {
    const d = mask;                         // level M = 00, then the mask
    let r = d; for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
    const f = ((d << 10) | r) ^ 0x5412, bit = (i) => ((f >>> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) set(8, i, bit(i));
    set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
    set(8, size - 8, true);
  };
  format(0);   // reserves the format areas
  // the data, two columns at a time from the bottom right, skipping the timing column
  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) {
      const x = right - j, up = ((right + 1) & 2) === 0, y = up ? size - 1 - vert : vert;
      if (!fn[y][x] && i < words.length * 8) { m[y][x] = ((words[i >>> 3] >>> (7 - (i & 7))) & 1) === 1; i++; }
    }
  }
  const MASKS = [(x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
    (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0];
  const apply = (k) => { for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && MASKS[k](x, y)) m[y][x] = !m[y][x]; };
  const score = () => {
    let s = 0;
    for (let a = 0; a < 2; a++) for (let p = 0; p < size; p++) {     // runs of five or more in a row or a column
      let run = 1;
      for (let q = 1; q <= size; q++) {
        const same = q < size && (a ? m[q][p] === m[q - 1][p] : m[p][q] === m[p][q - 1]);
        if (same) run++; else { if (run >= 5) s += run - 2; run = 1; }
      }
    }
    for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) if (m[y][x] === m[y][x + 1] && m[y][x] === m[y + 1][x] && m[y][x] === m[y + 1][x + 1]) s += 3;
    const dark = m.flat().filter(Boolean).length;
    return s + Math.floor(Math.abs(dark * 20 - size * size * 10) / (size * size)) * 10;
  };
  let best = 0, bestScore = Infinity;
  for (let k = 0; k < 8; k++) { apply(k); format(k); const sc = score(); if (sc < bestScore) { bestScore = sc; best = k; } apply(k); }
  apply(best); format(best);
  return m;
}

const CRC = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]), c = Buffer.alloc(4); c.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, c]);
};

/** The QR as a PNG: black on white, scale pixels a module, a quiet zone of four modules. */
export function qrPng(text, scale = 8) {
  const m = qrMatrix(text), n = m.length + 8, px = n * scale;
  const raw = Buffer.alloc((px + 1) * px, 0xff);
  for (let y = 0; y < px; y++) {
    raw[y * (px + 1)] = 0;                  // no filter on the row
    const my = Math.floor(y / scale) - 4;
    for (let x = 0; x < px; x++) { const mx = Math.floor(x / scale) - 4; if (my >= 0 && mx >= 0 && my < m.length && mx < m.length && m[my][mx]) raw[y * (px + 1) + 1 + x] = 0; }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(px, 0); ihdr.writeUInt32BE(px, 4); ihdr[8] = 8; ihdr[9] = 0; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
