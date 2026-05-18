// Analyze D:\GitHub\soft.pfforum (window.X globals style — no ES modules).
//
// Sources scanned:
//   dist/js/vue/**/*.js   (Vue components, shared lib/api/stores, templates)
// Libraries (shown as nodes, NOT scanned):
//   plugins/vue/{vue,pinia,axios,moment}.*.js
// PHP pages (shown as nodes, content NOT executed/parsed):
//   pages/spec_nom_view/*.php  — we only grep `'/dist/js/vue/…*.js'` string
//   literals to draw page → bundle edges. No PHP logic is interpreted.
//
// Colors:
//   .js source       → yellow
//   library          → cyan
//   .php page        → magenta  (the accent — purple is ONLY for PHP)

import { promises as fs } from 'node:fs'
import path from 'node:path'
import {
  walk,
  toId,
  rowId,
  yamlEscape,
  emitInline,
  maskStringsKeepingPositions,
  extractFunctions,
  extractWindowDefs,
  extractWindowRefs,
  findLabeledBlock,
  extractBlockMembers,
  WINDOW_BUILTINS,
  wrapAsTsDemo,
} from './lib/parser.mjs'

const ROOT = path.resolve('D:/GitHub/soft.pfforum')
const SRC_ROOT = path.join(ROOT, 'dist/js/vue')
const LIB_ROOT = path.join(ROOT, 'plugins/vue')
const PAGES_ROOT = path.join(ROOT, 'pages/spec_nom_view')
const OUT = path.resolve('D:/GitHub/glyph/src/demo/softPfforumDemo.ts')

// ─── layer / group id helpers ────────────────────────────────────────────

function topLayer(rel) {
  const seg = rel.replace(/\\/g, '/').split('/')
  // PHP pages live outside dist/js/vue and get their own bucket.
  if (seg.includes('spec_nom_view')) return 'pages'
  const trimmed = seg.filter(
    (s) => s && s !== 'dist' && s !== 'js' && s !== 'vue',
  )
  if (trimmed.length <= 1) return 'misc' // file directly under dist/js/vue
  if (trimmed[0] === 'shared') {
    if (trimmed.length >= 3) return `shared/${trimmed[1]}`
    return 'shared'
  }
  return trimmed[0]
}

function groupIdOf(layer) {
  return layer.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

// ─── Vue.defineComponent({methods, computed, watch}) extractor ───────────

function extractVueMembers(rawCode) {
  if (!/\bdefineComponent\s*\(/.test(rawCode)) return []
  const masked = maskStringsKeepingPositions(rawCode)
  const start = masked.search(/\bdefineComponent\s*\(/)
  const methods = extractBlockMembers(rawCode, masked, findLabeledBlock(masked, 'methods', start))
  const computed = extractBlockMembers(rawCode, masked, findLabeledBlock(masked, 'computed', start))
  const watchers = extractBlockMembers(rawCode, masked, findLabeledBlock(masked, 'watch', start))
  return [...methods, ...computed, ...watchers]
}

// ─── known library exports (we do NOT scan their content) ────────────────

const LIBRARY_DEFS = {
  'vue.global.prod.js': { exports: ['Vue'], color: 'cyan', icon: 'app-window' },
  'pinia.iife.prod.js': { exports: ['Pinia'], color: 'orange', icon: 'database' },
  'axios.min.js':       { exports: ['axios'], color: 'cyan', icon: 'cloud' },
  'moment.min.js':      { exports: ['moment'], color: 'green', icon: 'zap' },
}

// ─── scan ────────────────────────────────────────────────────────────────

const allDist = await walk(SRC_ROOT, () => false) // walk all, we filter below
const sources = allDist.filter(
  (p) =>
    p.endsWith('.js') &&
    !path.basename(p).startsWith('___') &&
    !p.replace(/\\/g, '/').includes('/dist/js/vue/library/') &&
    !p.replace(/\\/g, '/').includes('/dist/js/vue/types/'),
)
const libFiles = await walk(LIB_ROOT, () => false)

const byId = new Map()
const exportsToId = new Map() // window.NAME → defining node id

for (const abs of sources) {
  const rel = path.relative(ROOT, abs).replace(/\\/g, '/')
  const text = await fs.readFile(abs, 'utf8')
  const defs = extractWindowDefs(text)
  const refs = extractWindowRefs(text)
  const vueMembers = extractVueMembers(text)
  const fns = extractFunctions(text)
  const seen = new Set()
  const funcs = []
  for (const f of [...vueMembers, ...fns]) {
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
  for (const d of defs) if (!exportsToId.has(d)) exportsToId.set(d, id)
}

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
  for (const e of def.exports) if (!exportsToId.has(e)) exportsToId.set(e, id)
}

// ─── PHP pages (do NOT scan PHP code — only grep JS-path string literals) ─
// Each page becomes a magenta node. Edges page → bundle are drawn from any
// `'/dist/js/vue/.../*.js'` literal that appears in the file.

const pathToJsId = new Map()
for (const info of byId.values()) {
  if (info.isLibrary) continue
  // info.rel is like "dist/js/vue/widgets/BaseTable.js"; PHP refers to it as
  // a leading-slash web path, so we index both.
  pathToJsId.set('/' + info.rel, info.id)
}

const phpFiles = (await walk(PAGES_ROOT, () => false)).filter((p) =>
  p.endsWith('.php'),
)

for (const abs of phpFiles) {
  const rel = path.relative(ROOT, abs).replace(/\\/g, '/')
  const text = await fs.readFile(abs, 'utf8')
  // Extract every '/dist/js/vue/.../*.js' string literal — these are the
  // bundles this page pulls in. We do NOT interpret PHP arrays or spreads;
  // any path appearing literally in the file counts.
  const phpJsRefs = new Set()
  for (const m of text.matchAll(/['"](\/dist\/js\/vue\/[^'"\s]+\.js)['"]/g)) {
    phpJsRefs.add(m[1])
  }
  const id = toId(rel)
  byId.set(id, {
    id,
    rel,
    title: path.basename(rel),
    layer: 'pages',
    isLibrary: false,
    isPhp: true,
    defs: [],
    refs: [],
    funcs: [],
    phpJsRefs: [...phpJsRefs],
  })
}

// ─── build edges ─────────────────────────────────────────────────────────

const edges = []
const seenE = new Set()
for (const info of byId.values()) {
  // PHP page → bundle edges (resolved from grep'd '/dist/js/vue/.../*.js')
  if (info.isPhp) {
    for (const refPath of info.phpJsRefs ?? []) {
      const target = pathToJsId.get(refPath)
      if (!target) continue
      const key = `${info.id}->${target}`
      if (seenE.has(key)) continue
      seenE.add(key)
      edges.push({ from: info.id, to: target, fromPhp: true })
    }
    continue
  }
  // JS file → JS/library edges via window globals
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
  pages: 'pages · PHP entry',
  config: 'config',
  misc: 'misc',
}

// Group accent (the dashed-border color). Purple only for the PHP layer.
const LAYER_COLORS = {
  template: 'cyan',
  widgets: 'yellow',
  'shared/api': 'green',
  'shared/lib': 'yellow',
  'shared/stores': 'orange',
  shared: 'yellow',
  library: 'cyan',
  pages: 'magenta',
  misc: 'gray',
}

const usedLayers = new Set([...byId.values()].map((i) => i.layer))

const lines = []
lines.push('# Generated by tools/analyze-soft-pfforum.mjs')
lines.push('# Project: D:\\GitHub\\soft.pfforum (window-globals style, no ES modules)')
lines.push('# Sources scanned:   dist/js/vue/**/*.js')
lines.push('# Libraries (no scan): plugins/vue/{vue,pinia,axios,moment}.js')
lines.push('# Pages    (no scan): pages/spec_nom_view/*.php — only string-grepped for /dist/js/vue/*.js refs')
lines.push('# Colors:  .js → yellow   library → cyan   .php → magenta   (purple is reserved for PHP)')
lines.push('')

lines.push('groups:')
const ORDERED = [
  'pages',
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
    `  - ${emitInline({ id: groupIdOf(layer), title: LAYER_TITLES[layer] || layer, color: LAYER_COLORS[layer] || 'gray' })}`,
  )
}
lines.push('')

lines.push('nodes:')
// Color rule: JS source → yellow, library → cyan, PHP page → magenta
function nodeColor(info) {
  if (info.color) return info.color
  if (info.isPhp) return 'magenta'
  if (info.isLibrary) return 'cyan'
  return 'yellow'
}
function nodeIcon(info) {
  if (info.icon) return info.icon
  if (info.isPhp) return 'file-text'
  if (info.isLibrary) return 'cloud'
  return 'file-text'
}

const sorted = [...byId.values()].sort((a, b) => a.rel.localeCompare(b.rel))
for (const info of sorted) {
  const color = nodeColor(info)
  const icon = nodeIcon(info)
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
  // Edge inherits the source node's color: PHP→JS magenta, JS→anything yellow
  const color = e.fromPhp ? 'magenta' : 'yellow'
  lines.push(
    `  - ${emitInline({ from: `${e.from}.deps`, to: `${e.to}.in`, color })}`,
  )
}

const yaml = lines.join('\n')
const banner = `// AUTO-GENERATED by tools/analyze-soft-pfforum.mjs
// Source project: D:\\\\GitHub\\\\soft.pfforum
// Files scanned: ${sources.length}   Libraries: ${libFiles.filter((f) => LIBRARY_DEFS[path.basename(f)]).length}   Edges: ${edges.length}`

await fs.mkdir(path.dirname(OUT), { recursive: true })
await fs.writeFile(OUT, wrapAsTsDemo('softPfforumDemo', yaml, banner), 'utf8')

console.log(
  `[ok] sources=${sources.length} libs=${libFiles.filter((f) => LIBRARY_DEFS[path.basename(f)]).length} edges=${edges.length}`,
)
console.log(`[ok] wrote ${OUT}`)
