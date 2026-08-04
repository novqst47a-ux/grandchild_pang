import { writeFile, mkdir } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const name = Buffer.from(type);
  const output = Buffer.alloc(12 + data.length);
  output.writeUInt32BE(data.length, 0);
  name.copy(output, 4);
  data.copy(output, 8);
  output.writeUInt32BE(crc32(Buffer.concat([name, data])), 8 + data.length);
  return output;
}

function insideRoundedRect(x, y, left, top, width, height, radius) {
  const px = Math.max(left + radius, Math.min(x, left + width - radius));
  const py = Math.max(top + radius, Math.min(y, top + height - radius));
  return (x - px) ** 2 + (y - py) ** 2 <= radius ** 2;
}

function icon(size) {
  const pixels = Buffer.alloc((size * 4 + 1) * size);
  const colors = { cream: [255, 248, 233, 255], purple: [101, 65, 154, 255], dark: [71, 38, 111, 255], red: [182, 56, 73, 255], white: [255, 255, 255, 255] };
  const scale = size / 512;
  for (let y = 0; y < size; y += 1) {
    const row = y * (size * 4 + 1); pixels[row] = 0;
    for (let x = 0; x < size; x += 1) {
      const sx = x / scale; const sy = y / scale;
      let color = colors.cream;
      if (insideRoundedRect(sx, sy, 54, 54, 404, 404, 96)) color = colors.dark;
      if (insideRoundedRect(sx, sy, 70, 65, 372, 372, 80)) color = colors.purple;
      const heartLeft = ((sx - 203) ** 2 + (sy - 205) ** 2 < 77 ** 2);
      const heartRight = ((sx - 309) ** 2 + (sy - 205) ** 2 < 77 ** 2);
      const heartTip = sy >= 180 && sy <= 370 && Math.abs(sx - 256) < (370 - sy) * .83;
      if (heartLeft || heartRight || heartTip) color = colors.red;
      if ((sx - 217) ** 2 + (sy - 184) ** 2 < 20 ** 2 || (sx - 295) ** 2 + (sy - 184) ** 2 < 20 ** 2) color = colors.white;
      const offset = row + 1 + x * 4;
      pixels.set(color, offset);
    }
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(pixels, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

await mkdir(root, { recursive: true });
await Promise.all([192, 512].map((size) => writeFile(join(root, `icon-${size}.png`), icon(size))));
