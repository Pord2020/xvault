#!/usr/bin/env node
// Generates icon16.png, icon48.png, icon128.png for the Siftly Chrome extension.
// Pure Node.js — no dependencies needed.
const fs = require('fs')
const zlib = require('zlib')
const path = require('path')

// CRC32 implementation (required by PNG format)
const crcTable = new Uint32Array(256)
for (let i = 0; i < 256; i++) {
  let c = i
  for (let j = 0; j < 8; j++) c = (c & 1) ? 0xEDB88320 ^ (c >>> 1) : c >>> 1
  crcTable[i] = c
}
function crc32(buf) {
  let crc = 0xFFFFFFFF
  for (const b of buf) crc = crcTable[(crc ^ b) & 0xFF] ^ (crc >>> 8)
  return (crc ^ 0xFFFFFFFF) >>> 0
}

function chunk(type, data) {
  const t = Buffer.from(type, 'ascii')
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([t, data])))
  return Buffer.concat([len, t, data, crcBuf])
}

function makePNG(size) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

  // IHDR
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8   // bit depth
  ihdr[9] = 6   // RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0

  // Draw icon: indigo (#6366f1) background + white "S" letter
  const rows = []
  const padding = Math.max(1, Math.floor(size * 0.12))
  const cornerR = Math.floor(size * 0.2)

  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 4)
    row[0] = 0
    for (let x = 0; x < size; x++) {
      // Rounded rectangle mask
      const dx = Math.max(0, Math.max(cornerR - x, x - (size - 1 - cornerR)))
      const dy = Math.max(0, Math.max(cornerR - y, y - (size - 1 - cornerR)))
      const inBg = dx * dx + dy * dy <= cornerR * cornerR

      let r = 0, g = 0, b = 0, a = 0
      if (inBg) {
        // Background: indigo #6366f1
        r = 99; g = 102; b = 241; a = 255
      }

      // Draw "S" for Siftly (scaled to icon size)
      if (inBg && size >= 16) {
        const nx = (x - padding) / (size - padding * 2)  // 0..1
        const ny = (y - padding) / (size - padding * 2)  // 0..1
        if (nx >= 0 && nx <= 1 && ny >= 0 && ny <= 1) {
          const isS = drawS(nx, ny)
          if (isS) { r = 255; g = 255; b = 255; a = 255 }
        }
      }

      const i = 1 + x * 4
      row[i] = r; row[i+1] = g; row[i+2] = b; row[i+3] = a
    }
    rows.push(row)
  }

  const raw = Buffer.concat(rows)
  const compressed = zlib.deflateSync(raw, { level: 9 })

  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', compressed), chunk('IEND', Buffer.alloc(0))])
}

// Returns true if pixel at normalized (nx, ny) is part of the letter "S"
function drawS(nx, ny) {
  const thick = 0.18
  const cx = 0.5
  const topY = 0.12, midY = 0.5, botY = 0.88
  const left = 0.15, right = 0.85

  // Top bar
  if (ny >= topY && ny <= topY + thick && nx >= left && nx <= right) return true
  // Middle bar
  if (ny >= midY - thick/2 && ny <= midY + thick/2 && nx >= left && nx <= right) return true
  // Bottom bar
  if (ny >= botY - thick && ny <= botY && nx >= left && nx <= right) return true
  // Top-left vertical (top half, left side)
  if (nx >= left && nx <= left + thick && ny >= topY && ny <= midY) return true
  // Bottom-right vertical (bottom half, right side)
  if (nx >= right - thick && nx <= right && ny >= midY && ny <= botY) return true

  return false
}

const iconsDir = path.join(__dirname, 'icons')
if (!fs.existsSync(iconsDir)) fs.mkdirSync(iconsDir)

for (const size of [16, 48, 128]) {
  const buf = makePNG(size)
  const dest = path.join(iconsDir, `icon${size}.png`)
  fs.writeFileSync(dest, buf)
  console.log(`✓ icons/icon${size}.png  (${buf.length} bytes)`)
}
console.log('\nDone! Reload the extension in chrome://extensions/')
