// Analyze D:\GitHub\soft.pfforum (window.X globals style — no ES modules).
//
// Sources scanned:
//   dist/js/vue/**/*.js   (Vue components, shared lib/api/stores, templates)
// Libraries (shown as nodes, NOT scanned):
//   plugins/vue/{vue,pinia,axios,moment}.*.js
// PHP files (pages/spec_nom_view/**) are intentionally skipped.
//
// Each file's dependencies = the set of `window.X` it READS that some other
// file (or library) DEFINES via `window.X = …`. Reserved built-ins are stripped.
//
// Accent color: magenta (purple) — applied to source nodes and all edges.
// Libraries: yellow (distinct from sources).

import { promises as fs } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve('D:/GitHub/soft.pfforum')
const SRC_ROOT = path.join(ROOT, 'dist/js/vue')
const LIB_ROOT = path.join(ROOT, 'plugins/vue')
const OUT = path.resolve('D:/GitHub/glyph/src/demo/softPfforumDemo.ts')

// ─── walk ────────────────────────────────────────────────────────────────

async function walk(dir) {
  const out = []
  let entries
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) {
      out.push(...(await walk(full)))
    } else {
      out.push(full)
    }
  }
  return out
}

// ─── id helpers ──────────────────────────────────────────────────────────

function toId(rel) {
  return rel
    .replace(/\\/g, '/')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function rowId(name) {
  return (
    name
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40) || 'fn'
  )
}

// ─── source parsing ──────────────────────────────────────────────────────

const RESERVED_WORDS = new Set([
  'if', 'for', 'while', 'switch', 'return', 'catch', 'do', 'else',
  'function', 'typeof', 'in', 'of', 'new', 'delete', 'void', 'await',
  'async', 'yield', 'true', 'false', 'null', 'undefined',
])

// Built-in window properties we never want to render as dependencies.
const WINDOW_BUILTINS = new Set([
  'document', 'location', 'history', 'console', 'navigator', 'localStorage',
  'sessionStorage', 'innerHeight', 'innerWidth', 'addEventListener',
  'removeEventListener', 'open', 'close', 'alert', 'confirm', 'prompt',
  'parent', 'top', 'self', 'screen', 'performance', 'crypto', 'URL',
  'fetch', 'XMLHttpRequest', 'requestAnimationFrame', 'cancelAnimationFrame',
  'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'getComputedStyle',
  'matchMedia', 'devicePixelRatio', 'name', 'JSON', 'Object', 'Array',
  'String', 'Number', 'Boolean', 'Map', 'Set', 'Promise', 'Error', 'Math',
  'Date', 'RegExp', 'Function', 'Symbol', 'Proxy', 'Reflect',
  'event', 'innerText', 'scrollX', 'scrollY', 'pageXOffset', 'pageYOffset',
  'devicePixelRatio', 'closed', 'frames', 'length', 'origin', 'getSelection',
  'requestIdleCallback', 'cancelIdleCallback', 'scrollTo', 'scrollBy',
  'queueMicrotask', 'btoa', 'atob', 'structuredClone',
])

function stripCommentsAndStrings(src) {
  let s = src.replace(/\/\*[\s\S]*?\*\//g, '')
  s = s.replace(/(^|[^:])\/\/[^\n]*/g, '$1')
  s = s.replace(/`(?:\\.|[^`\\])*`/g, (m) => '`' + ' '.repeat(m.length - 2) + '`')
  s = s.replace(/'(?:\\.|[^'\\])*'/g, (m) => "'" + ' '.repeat(m.length - 2) + "'")
  s = s.replace(/"(?:\\.|[^"\\])*"/g, (m) => '"' + ' '.repeat(m.length - 2) + '"')
  return s
}

function descriptionAbove(rawSrc, pos) {
  let i = pos - 1
  while (i >= 0 && /\s/.test(rawSrc[i])) i--
  if (i < 0) return null
  if (rawSrc[i] === '/' && rawSrc[i - 1] === '*') {
    let j = i - 1
    while (j > 0 && !(rawSrc[j] === '/' && rawSrc[j + 1] === '*')) j--
    if (j < 0) return null
    const block = rawSrc.slice(j + 2, i - 1)
    return cleanBlockComment(block)
  }
  const lineEnd = i + 1
  let ls = lineEnd
  while (ls > 0 && rawSrc[ls - 1] !== '\n') ls--
  const lastLine = rawSrc.slice(ls, lineEnd).trim()
  const m = lastLine.match(/^\/\/\s?(.*)$/)
  if (!m) return null
  return clipDesc(m[1])
}

function cleanBlockComment(block) {
  const lines = block
    .split('\n')
    .map((l) => l.replace(/^\s*\*\s?/, '').trim())
    .filter((l) => l && !l.startsWith('@'))
  if (lines.length === 0) return null
  return clipDesc(lines[0])
}

function clipDesc(s) {
  s = s.replace(/\s+/g, ' ').trim()
  s = s.replace(/[.;,:]+$/, '')
  s = s.replace(/^[✅✔️•\-—–]\s*/, '').trim()
  if (s.length > 48) s = s.slice(0, 45).trim() + '…'
  return s || null
}

function extractWindowDefs(rawCode) {
  const masked = stripCommentsAndStrings(rawCode)
  const out = new Set()
  for (const m of masked.matchAll(/\bwindow\.([A-Za-z_$][\w$]*)\s*=/g)) {
    out.add(m[1])
  }
  return [...out]
}

function extractWindowRefs(rawCode) {
  const masked = stripCommentsAndStrings(rawCode)
  const out = new Set()
  for (const m of masked.matchAll(/\bwindow\.([A-Za-z_$][\w$]*)\b/g)) {
    out.add(m[1])
  }
  return [...out]
}

// Find the methods: { ... } block inside `defineComponent({ ... })` and
// list the keys with their JSDoc / preceding-line descriptions.
function extractVueMethods(rawCode) {
  const idx = rawCode.search(/\bdefineComponent\s*\(/)
  if (idx === -1) return []
  // mask only strings (positions preserved)
  let src = rawCode
  src = src.replace(/`(?:\\.|[^`\\])*`/g, (m) => '`' + ' '.repeat(m.length - 2) + '`')
  src = src.replace(/'(?:\\.|[^'\\])*'/g, (m) => "'" + ' '.repeat(m.length - 2) + "'")
  src = src.replace(/"(?:\\.|[^"\\])*"/g, (m) => '"' + ' '.repeat(m.length - 2) + '"')

  // grab `methods: { … }` block bounds
  function blockBetween(label) {
    const re = new RegExp(`\\b${label}\\s*:\\s*\\{`, 'g')
    re.lastIndex = idx
    const m = re.exec(src)
    if (!m) return null
    let depth = 0
    const start = m.index + m[0].length - 1
    for (let i = start; i < src.length; i++) {
      if (src[i] === '{') depth++
      else if (src[i] === '}') {
        depth--
        if (depth === 0) return { from: start + 1, to: i }
      }
    }
    return null
  }

  function grab(range) {
    if (!range) return []
    const block = src.slice(range.from, range.to)
    const found = new Map()
    for (const m of block.matchAll(
      /(?:^|[\n,{])(\s*)(?:async\s+)?([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/g,
    )) {
      const name = m[2]
      if (RESERVED_WORDS.has(name)) continue
      const absPos = range.from + m.index
      const desc = descriptionAbove(rawCode, absPos)
      if (!found.has(name)) found.set(name, { name, desc })
    }
    return [...found.values()]
  }

  const methods = grab(blockBetween('methods'))
  const computed = grab(blockBetween('computed'))
  const watchers = grab(blockBetween('watch'))
  return [...methods, ...computed, ...watchers]
}

function extractFunctions(rawCode) {
  const masked = stripCommentsAndStrings(rawCode)
  const found = new Map()
  function push(name, pos) {
    if (RESERVED_WORDS.has(name) || name.length <= 1) return
    if (found.has(name)) return
    const desc = descriptionAbove(rawCode, pos)
    found.set(name, { name, desc })
  }
  for (const m of masked.matchAll(
    /\b(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g,
  )) {
    push(m[1], m.index)
  }
  for (const m of masked.matchAll(
    /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/g,
  )) {
    push(m[1], m.index)
  }
  return [...found.values()]
}

// ─── files ───────────────────────────────────────────────────────────────

const allDist = await walk(SRC_ROOT)
const sources = allDist.filter(
  (p) =>
    p.endsWith('.js') &&
    !path.basename(p).startsWith('___') &&
    !p.replace(/\\/g, '/').includes('/dist/js/vue/library/') &&
    !p.replace(/\\/g, '/').includes('/dist/js/vue/types/'),
)

const libFiles = await walk(LIB_ROOT)

// Known library exports (don't scan their content — too big and minified).
const LIBRARY_DEFS = {
  'vue.global.prod.js': { exports: ['Vue'], color: 'cyan', icon: 'app-window' },
  'pinia.iife.prod.js': { exports: ['Pinia'], color: 'orange', icon: 'database' },
  'axios.min.js':       { exports: ['axios'], color: 'cyan', icon: 'cloud' },
  'moment.min.js':      { exports: ['moment'], color: 'green', icon: 'zap' },
}

// ─── parse all sources ───────────────────────────────────────────────────

const byId = new Map()
const exportsToId = new Map() // window.NAME  ->  defining node id

function topLayer(rel) {
  const seg = rel.replace(/\\/g, '/').split('/')
  const trimmed = seg.filter(
    (s) => s && s !== 'dist' && s !== 'js' && s !== 'vue',
  )
  // file directly in dist/js/vue (no subdir) — falls into "misc"
  if (trimmed.length <= 1) return 'misc'
  if (trimmed[0] === 'shared') {
    return `shared/${trimmed[1]}`.replace(/\/$/, '')
  }
  return trimmed[0]
}

function groupIdOf(layer) {
  return layer.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

for (const abs of sources) {
  const rel = path.relative(ROOT, abs).replace(/\\/g, '/')
  const text = await fs.readFile(abs, 'utf8')
  const defs = extractWindowDefs(text)
  const refs = extractWindowRefs(text)
  const vueMethods = extractVueMethods(text)
  const fns = extractFunctions(text)
  // dedupe (method name might also appear as top-level function via mocks)
  const seen = new Set()
  const funcs = []
  for (const f of [...vueMethods, ...fns]) {
    if (seen.has(f.name)) continue
    seen.add(f.name)
    funcs.push(f)
  }

  const id = toId(rel)
  byId.set(id, {
    id,
    rel,
    title: path.basename(rel),
    layer: topLayer(rel),
    isLibrary: false,
    defs,
    refs,
    funcs,
  })
  for (const d of defs) {
    if (!exportsToId.has(d)) exportsToId.set(d, id)
  }
}

// ─── library nodes (not scanned) ─────────────────────────────────────────

for (const abs of libFiles) {
  const base = path.basename(abs)
  const def = LIBRARY_DEFS[base]
  if (!def) continue
  const rel = path.relative(ROOT, abs).replace(/\\/g, '/')
  const id = toId(rel)
  byId.set(id, {
    id,
    rel,
    title: base,
    layer: 'library',
    isLibrary: true,
    defs: def.exports,
    refs: [],
    funcs: def.exports.map((e) => ({ name: e, desc: 'global namespace' })),
    color: def.color,
    icon: def.icon,
  })
  for (const e of def.exports) {
    if (!exportsToId.has(e)) exportsToId.set(e, id)
  }
}

// ─── build edges  ────────────────────────────────────────────────────────

const edges = []
const seenE = new Set()
for (const info of byId.values()) {
  // exclude self-defined refs, exclude built-ins, exclude refs to unknowns
  const wantsDef = new Set(info.refs)
  for (const own of info.defs) wantsDef.delete(own)
  for (const b of WINDOW_BUILTINS) wantsDef.delete(b)

  for (const name of wantsDef) {
    const target = exportsToId.get(name)
    if (!target || target === info.id) continue
    const key = `${info.id}->${target}`
    if (seenE.has(key)) continue
    seenE.add(key)
    edges.push({ from: info.id, to: target, label: name })
  }
}

const incoming = new Map()
const outgoing = new Map()
for (const e of edges) {
  incoming.set(e.to, (incoming.get(e.to) || 0) + 1)
  outgoing.set(e.from, (outgoing.get(e.from) || 0) + 1)
}

// ─── emit YAML ───────────────────────────────────────────────────────────

const LAYER_TITLES = {
  template: 'template · entry apps',
  widgets: 'widgets',
  'shared/api': 'shared · API',
  'shared/lib': 'shared · lib',
  'shared/stores': 'shared · stores',
  shared: 'shared',
  library: 'plugins/vue · libraries',
  config: 'config',
  misc: 'misc',
}

const usedLayers = new Set([...byId.values()].map((i) => i.layer))

function yamlEscape(s) {
  if (s === '' || /[:#&*!|>'"%@`{}\[\],?\-]/.test(s) || /^\s|\s$/.test(s)) {
    return JSON.stringify(s)
  }
  return s
}

function emitInline(obj) {
  const parts = []
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue
    if (typeof v === 'object') parts.push(`${k}: ${emitInline(v)}`)
    else if (typeof v === 'string') parts.push(`${k}: ${yamlEscape(v)}`)
    else parts.push(`${k}: ${v}`)
  }
  return `{ ${parts.join(', ')} }`
}

const lines = []
lines.push('# Generated by tools/analyze-soft-pfforum.mjs')
lines.push('# Project: D:\\GitHub\\soft.pfforum (window-globals style, no ES modules)')
lines.push('# Sources scanned: dist/js/vue/**/*.js')
lines.push('# Libraries shown but not scanned: plugins/vue/{vue,pinia,axios,moment}.js')
lines.push('# Accent color: magenta')
lines.push('')

lines.push('groups:')
// order matters for layout — entry apps first, libraries last
const ORDERED = [
  'template',
  'widgets',
  'shared/api',
  'shared/lib',
  'shared/stores',
  'shared',
  'config',
  'misc',
  'library',
]
for (const layer of ORDERED) {
  if (!usedLayers.has(layer)) continue
  lines.push(
    `  - ${emitInline({ id: groupIdOf(layer), title: LAYER_TITLES[layer] || layer, color: layer === 'library' ? 'yellow' : 'magenta' })}`,
  )
}
lines.push('')

lines.push('nodes:')
const sorted = [...byId.values()].sort((a, b) => a.rel.localeCompare(b.rel))
for (const info of sorted) {
  const color = info.color || (info.isLibrary ? 'yellow' : 'magenta')
  const icon = info.icon || (info.isLibrary ? 'cloud' : 'file-text')
  const incCount = incoming.get(info.id) || 0
  const outCount = outgoing.get(info.id) || 0

  lines.push(`  - id: ${info.id}`)
  lines.push(`    title: ${yamlEscape(info.title)}`)
  lines.push(`    icon: ${icon}`)
  lines.push(`    group: ${groupIdOf(info.layer)}`)
  lines.push(`    rows:`)
  lines.push(
    `      - ${emitInline({ id: 'in', icon: 'download', label: 'used by', value: String(incCount), color, type: 'target' })}`,
  )

  const seen = new Set(['in', 'deps'])
  for (const fn of info.funcs) {
    let rid = rowId(fn.name)
    let suffix = 1
    while (seen.has(rid)) rid = rowId(fn.name) + '_' + suffix++
    seen.add(rid)
    const label = fn.desc ? `${fn.name} (${fn.desc})` : fn.name
    lines.push(
      `      - ${emitInline({ id: rid, icon: 'box', label, color, type: 'source' })}`,
    )
  }

  lines.push(
    `      - ${emitInline({ id: 'deps', icon: 'upload', label: 'uses', value: String(outCount), color, type: 'source' })}`,
  )
}
lines.push('')

lines.push('edges:')
for (const e of edges) {
  lines.push(
    `  - ${emitInline({ from: `${e.from}.deps`, to: `${e.to}.in`, color: 'magenta' })}`,
  )
}

const yaml = lines.join('\n')

const banner = `// AUTO-GENERATED by tools/analyze-soft-pfforum.mjs
// Source project: D:\\\\GitHub\\\\soft.pfforum
// Files scanned: ${sources.length}   Libraries: ${libFiles.filter((f) => LIBRARY_DEFS[path.basename(f)]).length}   Edges: ${edges.length}
`
const ts =
  banner +
  '\nexport const softPfforumDemo = ' +
  '`' +
  yaml.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${') +
  '`\n'

await fs.mkdir(path.dirname(OUT), { recursive: true })
await fs.writeFile(OUT, ts, 'utf8')
console.log(
  `[ok] sources=${sources.length} libs=${libFiles.filter((f) => LIBRARY_DEFS[path.basename(f)]).length} edges=${edges.length}`,
)
console.log(`[ok] wrote ${OUT}`)
