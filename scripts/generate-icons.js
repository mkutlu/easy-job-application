// Generates placeholder solid-color square PNG icons with no external
// dependencies (just node:zlib), so the repo doesn't need a real logo to
// build. Replace public/icons/*.png with real artwork whenever convenient.
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "..", "public", "icons");
mkdirSync(outDir, { recursive: true });

const SIZES = [16, 48, 128];
// Indigo-ish square with a lighter "J" glyph blob, good enough as a placeholder.
const BG = [79, 70, 229, 255];
const FG = [238, 242, 255, 255];

function crc32(buf) {
  let c;
  const table = crc32.table || (crc32.table = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })());
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function pixelAt(x, y, size) {
  // simple rounded-rect-ish "J" glyph: a vertical bar + a foot, inset from edges
  const inset = Math.max(2, Math.round(size * 0.22));
  const barW = Math.max(2, Math.round(size * 0.16));
  const barX = size - inset - barW;
  const barTop = inset;
  const barBottom = size - inset - Math.round(size * 0.18);
  const footY0 = size - inset - Math.round(size * 0.16);
  const footY1 = size - inset;
  const footX0 = inset + Math.round(size * 0.1);

  const inBar = x >= barX && x < barX + barW && y >= barTop && y < barBottom;
  const inFoot = x >= footX0 && x < barX + barW && y >= footY0 && y < footY1;
  return inBar || inFoot ? FG : BG;
}

function makePng(size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  let offset = 0;
  for (let y = 0; y < size; y++) {
    raw[offset++] = 0; // filter type 0 for this scanline
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixelAt(x, y, size);
      raw[offset++] = r;
      raw[offset++] = g;
      raw[offset++] = b;
      raw[offset++] = a;
    }
  }

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const idat = deflateSync(raw);
  const iend = Buffer.alloc(0);

  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", iend),
  ]);
}

for (const size of SIZES) {
  const png = makePng(size);
  const path = join(outDir, `icon${size}.png`);
  writeFileSync(path, png);
  console.log(`wrote ${path}`);
}
