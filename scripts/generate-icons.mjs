import { spawnSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { deflateSync } from 'node:zlib'

const repoRoot = resolve(new URL('..', import.meta.url).pathname)
const desktopIconRoot = join(repoRoot, 'packages/desktop/build/icons')
const iosIconRoot = join(
  repoRoot,
  'packages/mobile-viewer/ios/DeskMobileViewer/Images.xcassets/AppIcon.appiconset',
)
const androidResRoot = join(repoRoot, 'packages/mobile-viewer/android/app/src/main/res')

const variants = {
  agent: {
    background: [
      [0, '#047857'],
      [0.55, '#0f766e'],
      [1, '#0b1023'],
    ],
    accent: '#a7f3d0',
    panel: '#ecfdf5',
    screen: '#06151d',
    glow: '#2dd4bf',
  },
  viewer: {
    background: [
      [0, '#1456f0'],
      [0.58, '#0891b2'],
      [1, '#080d1f'],
    ],
    accent: '#bfdbfe',
    panel: '#eff6ff',
    screen: '#060b1c',
    glow: '#38bdf8',
  },
  ios: {
    background: [
      [0, '#4f46e5'],
      [0.52, '#0f172a'],
      [1, '#be185d'],
    ],
    accent: '#f5d0fe',
    panel: '#f8fafc',
    screen: '#111827',
    glow: '#a78bfa',
  },
  android: {
    background: [
      [0, '#0f766e'],
      [0.5, '#102a43'],
      [1, '#022c22'],
    ],
    accent: '#ccfbf1',
    panel: '#ecfeff',
    screen: '#071a1f',
    glow: '#22c55e',
  },
}

const androidSizes = {
  mdpi: 48,
  hdpi: 72,
  xhdpi: 96,
  xxhdpi: 144,
  xxxhdpi: 192,
}

const iosSlots = [
  ['iphone', 20, 2],
  ['iphone', 20, 3],
  ['iphone', 29, 2],
  ['iphone', 29, 3],
  ['iphone', 40, 2],
  ['iphone', 40, 3],
  ['iphone', 60, 2],
  ['iphone', 60, 3],
  ['ipad', 20, 1],
  ['ipad', 20, 2],
  ['ipad', 29, 1],
  ['ipad', 29, 2],
  ['ipad', 40, 1],
  ['ipad', 40, 2],
  ['ipad', 76, 1],
  ['ipad', 76, 2],
  ['ipad', 83.5, 2],
  ['ios-marketing', 1024, 1],
]

main()

function main() {
  mkdirSync(desktopIconRoot, { recursive: true })
  mkdirSync(iosIconRoot, { recursive: true })

  writePng(join(desktopIconRoot, 'agent.png'), renderIcon(1024, 'agent'))
  writePng(join(desktopIconRoot, 'viewer.png'), renderIcon(1024, 'viewer'))
  writeIcns('agent')
  writeIcns('viewer')
  writeIosIcons()
  writeAndroidIcons()

  console.log('Generated app icons for desktop Agent, desktop Viewer, iOS, Android.')
}

function writeIcns(variant) {
  const iconsetDir = join(desktopIconRoot, `${variant}.iconset`)
  rmSync(iconsetDir, { recursive: true, force: true })
  mkdirSync(iconsetDir, { recursive: true })

  const slots = [
    ['icon_16x16.png', 16],
    ['icon_16x16@2x.png', 32],
    ['icon_32x32.png', 32],
    ['icon_32x32@2x.png', 64],
    ['icon_128x128.png', 128],
    ['icon_128x128@2x.png', 256],
    ['icon_256x256.png', 256],
    ['icon_256x256@2x.png', 512],
    ['icon_512x512.png', 512],
    ['icon_512x512@2x.png', 1024],
  ]

  for (const [file, size] of slots) {
    writePng(join(iconsetDir, file), renderIcon(size, variant))
  }

  const result = spawnSync(
    'iconutil',
    ['-c', 'icns', iconsetDir, '-o', join(desktopIconRoot, `${variant}.icns`)],
    {
      stdio: 'pipe',
    },
  )

  if (result.status !== 0) {
    console.warn(`iconutil failed for ${variant}; desktop packaging will use PNG fallback.`)
  }
}

function writeIosIcons() {
  const images = iosSlots.map(([idiom, points, scale]) => {
    const px = Math.round(points * scale)
    const pointName = String(points).replace('.', '_')
    const filename = `ios-viewer-${pointName}@${scale}x.png`
    writePng(join(iosIconRoot, filename), renderIcon(px, 'ios'))
    return {
      filename,
      idiom,
      scale: `${scale}x`,
      size: `${points}x${points}`,
    }
  })

  writeFileSync(
    join(iosIconRoot, 'Contents.json'),
    `${JSON.stringify(
      {
        images,
        info: {
          author: 'xcode',
          version: 1,
        },
      },
      null,
      2,
    )}\n`,
  )
}

function writeAndroidIcons() {
  for (const [density, size] of Object.entries(androidSizes)) {
    const dir = join(androidResRoot, `mipmap-${density}`)
    mkdirSync(dir, { recursive: true })
    writePng(join(dir, 'ic_launcher.png'), renderIcon(size, 'android'))
    writePng(join(dir, 'ic_launcher_round.png'), renderIcon(size, 'android', { roundMask: true }))
  }
}

function renderIcon(size, variantName, options = {}) {
  const spec = variants[variantName]
  const bitmap = new Uint8Array(size * size * 4)

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const nx = (x + 0.5) / size
      const ny = (y + 0.5) / size
      const base = gradient(spec.background, clamp((nx + ny * 1.15) / 2.15, 0, 1))
      const vignette = 0.86 + 0.14 * (1 - distance(nx, ny, 0.5, 0.48))
      put(bitmap, size, x, y, [base[0] * vignette, base[1] * vignette, base[2] * vignette, 255])
    }
  }

  if (variantName === 'agent') {
    paintAgent(bitmap, size, spec)
  } else if (variantName === 'viewer') {
    paintViewer(bitmap, size, spec)
  } else if (variantName === 'ios') {
    paintIos(bitmap, size, spec)
  } else {
    paintAndroid(bitmap, size, spec)
  }

  if (options.roundMask) {
    applyRoundMask(bitmap, size)
  }

  return { width: size, height: size, data: bitmap }
}

function paintAgent(bitmap, size, spec) {
  fillRoundedRect(bitmap, size, 0.16, 0.2, 0.68, 0.5, 0.08, hex(spec.panel), 0.96)
  fillRoundedRect(bitmap, size, 0.22, 0.29, 0.56, 0.31, 0.035, hex(spec.screen), 1)
  fillRoundedRect(bitmap, size, 0.28, 0.34, 0.44, 0.2, 0.025, hex('#12313a'), 1)
  fillRoundedRect(bitmap, size, 0.44, 0.68, 0.12, 0.11, 0.02, hex(spec.panel), 0.9)
  fillRoundedRect(bitmap, size, 0.31, 0.78, 0.38, 0.055, 0.028, hex(spec.panel), 0.92)
  fillCircle(bitmap, size, 0.5, 0.445, 0.105, hex(spec.glow), 0.9)
  fillCircle(bitmap, size, 0.5, 0.445, 0.052, hex('#ffffff'), 0.95)
  drawLine(bitmap, size, 0.31, 0.445, 0.17, 0.445, 0.022, hex(spec.accent), 0.8)
  drawLine(bitmap, size, 0.69, 0.445, 0.83, 0.445, 0.022, hex(spec.accent), 0.8)
  fillCircle(bitmap, size, 0.15, 0.445, 0.05, hex(spec.accent), 0.96)
  fillCircle(bitmap, size, 0.85, 0.445, 0.05, hex(spec.accent), 0.96)
}

function paintViewer(bitmap, size, spec) {
  fillRoundedRect(bitmap, size, 0.14, 0.24, 0.68, 0.5, 0.075, hex(spec.panel), 0.95)
  fillRoundedRect(bitmap, size, 0.21, 0.31, 0.54, 0.35, 0.035, hex(spec.screen), 1)
  fillRoundedRect(bitmap, size, 0.26, 0.37, 0.33, 0.11, 0.025, hex('#123b63'), 1)
  fillCircle(bitmap, size, 0.67, 0.53, 0.055, hex(spec.glow), 0.95)
  fillPolygon(
    bitmap,
    size,
    [
      [0.47, 0.48],
      [0.82, 0.7],
      [0.66, 0.74],
      [0.58, 0.9],
    ],
    hex('#ffffff'),
    0.96,
  )
  fillPolygon(
    bitmap,
    size,
    [
      [0.61, 0.71],
      [0.69, 0.88],
      [0.62, 0.91],
      [0.54, 0.74],
    ],
    hex('#0f172a'),
    0.55,
  )
}

function paintIos(bitmap, size, spec) {
  fillCircle(bitmap, size, 0.22, 0.2, 0.18, hex(spec.glow), 0.28)
  fillCircle(bitmap, size, 0.82, 0.78, 0.24, hex('#f472b6'), 0.22)
  fillRoundedRect(bitmap, size, 0.26, 0.12, 0.48, 0.76, 0.105, hex(spec.panel), 0.96)
  fillRoundedRect(bitmap, size, 0.31, 0.2, 0.38, 0.59, 0.055, hex(spec.screen), 1)
  fillRoundedRect(bitmap, size, 0.36, 0.28, 0.28, 0.2, 0.035, hex('#312e81'), 1)
  fillRoundedRect(bitmap, size, 0.36, 0.53, 0.28, 0.08, 0.025, hex(spec.glow), 0.85)
  fillRoundedRect(bitmap, size, 0.4, 0.7, 0.2, 0.025, 0.013, hex('#cbd5e1'), 0.9)
  fillCircle(bitmap, size, 0.5, 0.84, 0.024, hex('#94a3b8'), 0.8)
}

function paintAndroid(bitmap, size, spec) {
  fillCircle(bitmap, size, 0.78, 0.2, 0.18, hex(spec.glow), 0.22)
  drawLine(bitmap, size, 0.33, 0.24, 0.25, 0.14, 0.022, hex(spec.accent), 0.9)
  drawLine(bitmap, size, 0.67, 0.24, 0.75, 0.14, 0.022, hex(spec.accent), 0.9)
  fillRoundedRect(bitmap, size, 0.25, 0.23, 0.5, 0.32, 0.12, hex(spec.panel), 0.96)
  fillRoundedRect(bitmap, size, 0.2, 0.45, 0.6, 0.34, 0.065, hex(spec.panel), 0.96)
  fillCircle(bitmap, size, 0.38, 0.38, 0.031, hex(spec.screen), 1)
  fillCircle(bitmap, size, 0.62, 0.38, 0.031, hex(spec.screen), 1)
  fillRoundedRect(bitmap, size, 0.3, 0.54, 0.4, 0.15, 0.035, hex(spec.screen), 1)
  fillRoundedRect(bitmap, size, 0.36, 0.59, 0.28, 0.038, 0.019, hex(spec.glow), 0.85)
}

function fillRoundedRect(bitmap, size, x, y, w, h, r, color, opacity = 1) {
  const edge = 1.4 / size
  for (let py = Math.floor(y * size) - 2; py <= Math.ceil((y + h) * size) + 2; py += 1) {
    for (let px = Math.floor(x * size) - 2; px <= Math.ceil((x + w) * size) + 2; px += 1) {
      const nx = (px + 0.5) / size
      const ny = (py + 0.5) / size
      const d = roundRectDistance(nx, ny, x + w / 2, y + h / 2, w / 2, h / 2, r)
      const alpha = clamp(0.5 - d / edge, 0, 1) * opacity
      if (alpha > 0) blend(bitmap, size, px, py, color, alpha)
    }
  }
}

function fillCircle(bitmap, size, cx, cy, r, color, opacity = 1) {
  const edge = 1.3 / size
  for (let py = Math.floor((cy - r) * size) - 2; py <= Math.ceil((cy + r) * size) + 2; py += 1) {
    for (let px = Math.floor((cx - r) * size) - 2; px <= Math.ceil((cx + r) * size) + 2; px += 1) {
      const nx = (px + 0.5) / size
      const ny = (py + 0.5) / size
      const alpha = clamp(0.5 - (distance(nx, ny, cx, cy) - r) / edge, 0, 1) * opacity
      if (alpha > 0) blend(bitmap, size, px, py, color, alpha)
    }
  }
}

function drawLine(bitmap, size, x1, y1, x2, y2, width, color, opacity = 1) {
  const edge = 1.2 / size
  const minX = Math.min(x1, x2) - width
  const maxX = Math.max(x1, x2) + width
  const minY = Math.min(y1, y2) - width
  const maxY = Math.max(y1, y2) + width
  for (let py = Math.floor(minY * size) - 2; py <= Math.ceil(maxY * size) + 2; py += 1) {
    for (let px = Math.floor(minX * size) - 2; px <= Math.ceil(maxX * size) + 2; px += 1) {
      const nx = (px + 0.5) / size
      const ny = (py + 0.5) / size
      const d = segmentDistance(nx, ny, x1, y1, x2, y2) - width / 2
      const alpha = clamp(0.5 - d / edge, 0, 1) * opacity
      if (alpha > 0) blend(bitmap, size, px, py, color, alpha)
    }
  }
}

function fillPolygon(bitmap, size, points, color, opacity = 1) {
  const xs = points.map(([x]) => x)
  const ys = points.map(([, y]) => y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  for (let py = Math.floor(minY * size); py <= Math.ceil(maxY * size); py += 1) {
    for (let px = Math.floor(minX * size); px <= Math.ceil(maxX * size); px += 1) {
      const nx = (px + 0.5) / size
      const ny = (py + 0.5) / size
      if (pointInPolygon(nx, ny, points)) {
        blend(bitmap, size, px, py, color, opacity)
      }
    }
  }
}

function applyRoundMask(bitmap, size) {
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const nx = (x + 0.5) / size
      const ny = (y + 0.5) / size
      const alpha = clamp(0.5 - (distance(nx, ny, 0.5, 0.5) - 0.5) * size, 0, 1)
      const i = (y * size + x) * 4
      bitmap[i + 3] = Math.round(bitmap[i + 3] * alpha)
    }
  }
}

function writePng(file, image) {
  writeFileSync(file, encodePng(image.width, image.height, image.data))
}

function encodePng(width, height, rgba) {
  const rowSize = width * 4 + 1
  const raw = Buffer.alloc(rowSize * height)
  for (let y = 0; y < height; y += 1) {
    raw[y * rowSize] = 0
    Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(raw, y * rowSize + 1)
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', Buffer.concat([u32(width), u32(height), Buffer.from([8, 6, 0, 0, 0])])),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type)
  return Buffer.concat([
    u32(data.length),
    typeBuffer,
    data,
    u32(crc32(Buffer.concat([typeBuffer, data]))),
  ])
}

function u32(value) {
  const buffer = Buffer.alloc(4)
  buffer.writeUInt32BE(value >>> 0, 0)
  return buffer
}

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc ^= byte
    for (let i = 0; i < 8; i += 1) {
      crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function put(bitmap, size, x, y, color) {
  if (x < 0 || y < 0 || x >= size || y >= size) return
  const i = (y * size + x) * 4
  bitmap[i] = clampByte(color[0])
  bitmap[i + 1] = clampByte(color[1])
  bitmap[i + 2] = clampByte(color[2])
  bitmap[i + 3] = clampByte(color[3])
}

function blend(bitmap, size, x, y, color, opacity) {
  if (x < 0 || y < 0 || x >= size || y >= size) return
  const i = (y * size + x) * 4
  const alpha = (color[3] / 255) * opacity
  const inv = 1 - alpha
  bitmap[i] = clampByte(color[0] * alpha + bitmap[i] * inv)
  bitmap[i + 1] = clampByte(color[1] * alpha + bitmap[i + 1] * inv)
  bitmap[i + 2] = clampByte(color[2] * alpha + bitmap[i + 2] * inv)
  bitmap[i + 3] = clampByte(255 * alpha + bitmap[i + 3] * inv)
}

function gradient(stops, t) {
  for (let i = 0; i < stops.length - 1; i += 1) {
    const [at, from] = stops[i]
    const [nextAt, to] = stops[i + 1]
    if (t >= at && t <= nextAt) {
      const localT = (t - at) / (nextAt - at)
      const a = hex(from)
      const b = hex(to)
      return [lerp(a[0], b[0], localT), lerp(a[1], b[1], localT), lerp(a[2], b[2], localT)]
    }
  }

  return hex(stops[stops.length - 1][1])
}

function hex(value) {
  const clean = value.replace('#', '')
  return [
    Number.parseInt(clean.slice(0, 2), 16),
    Number.parseInt(clean.slice(2, 4), 16),
    Number.parseInt(clean.slice(4, 6), 16),
    255,
  ]
}

function roundRectDistance(x, y, cx, cy, hx, hy, r) {
  const qx = Math.abs(x - cx) - hx + r
  const qy = Math.abs(y - cy) - hy + r
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r
}

function segmentDistance(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1
  const dy = y2 - y1
  const lengthSquared = dx * dx + dy * dy
  const t = lengthSquared === 0 ? 0 : clamp(((px - x1) * dx + (py - y1) * dy) / lengthSquared, 0, 1)
  return distance(px, py, x1 + dx * t, y1 + dy * t)
}

function pointInPolygon(x, y, points) {
  let inside = false
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const [xi, yi] = points[i]
    const [xj, yj] = points[j]
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
    if (intersects) inside = !inside
  }
  return inside
}

function distance(x1, y1, x2, y2) {
  return Math.hypot(x1 - x2, y1 - y2)
}

function lerp(a, b, t) {
  return a + (b - a) * t
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function clampByte(value) {
  return Math.round(clamp(value, 0, 255))
}
