// Analyze D:\GitHub\modules-soft__pf-forum and produce a Glyph DSL YAML.
// Output: D:\GitHub\glyph\src\demo\pfForumDemo.ts (exports the YAML string).
//
// Colors:
//   .vue            -> green
//   .js             -> yellow
//   pinia store     -> orange  (defineStore detected)
// Groups by top-level FSD layer: app / shared / entities / features / widgets / pages.

import { promises as fs } from 'node:fs'
import path from 'node:path'
import {
  walk,
  toId,
  rowId,
  yamlEscape,
  emitInline,
  stripCommentsAndStrings,
  maskStringsKeepingPositions,
  descriptionAbove,
  JS_RESERVED,
  extractFunctions,
  extractImports,
  findLabeledBlock,
  extractBlockMembers,
  wrapAsTsDemo,
} from './lib/parser.mjs'

const ROOT = path.resolve('D:/GitHub/modules-soft__pf-forum')
const SRC = path.join(ROOT, 'src')
const OUT = path.resolve('D:/GitHub/glyph/src/demo/pfForumDemo.ts')

// ─── .vue helpers ────────────────────────────────────────────────────────

function extractScriptFromVue(text) {
  const out = []
  const re = /<script[^>]*>([\s\S]*?)<\/script>/g
  let m
  while ((m = re.exec(text))) out.push(m[1])
  return out.join('\n')
}

function shortTitle(rel) {
  return path.basename(rel)
}

function topLayer(rel) {
  const seg = rel.replace(/\\/g, '/').split('/')[1] // skip "src/"
  return seg || 'misc'
}

// ─── pinia store helpers (project-specific) ──────────────────────────────

/** Detect & parse a `defineStore` file → options-store actions/getters. */
function extractPiniaActions(rawCode) {
  if (!/defineStore\s*\(/.test(rawCode))
    return { isStore: false, actions: [], getters: [], state: [] }
  const masked = maskStringsKeepingPositions(rawCode)
  const actBlock = findLabeledBlock(masked, 'actions')
  const getBlock = findLabeledBlock(masked, 'getters')
  return {
    isStore: true,
    actions: extractBlockMembers(rawCode, masked, actBlock),
    getters: extractBlockMembers(rawCode, masked, getBlock),
    state: [],
  }
}

/** For the setup-store form `defineStore('x', () => { … return { a, b } })`. */
function extractStoreSetupReturn(rawCode) {
  const src = stripCommentsAndStrings(rawCode)
  if (!/defineStore\s*\(\s*['"][^'"]+['"]\s*,\s*\(\s*\)\s*=>/.test(src)) return null
  const re = /return\s*\{([^}]*)\}/g
  const names = new Set()
  let m
  while ((m = re.exec(src))) {
    for (const t of m[1].split(',')) {
      const n = t.trim().split(/[:\s]/)[0]
      if (n && /^[A-Za-z_$][\w$]*$/.test(n) && !JS_RESERVED.has(n)) names.add(n)
    }
  }
  return names.size ? [...names] : null
}

// ─── import resolution ───────────────────────────────────────────────────

async function fileExists(p) {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

async function resolveImport(spec, fromFile, knownByPath) {
  if (!spec) return null
  if (!spec.startsWith('.') && !spec.startsWith('@/')) return null // external
  let absBase
  if (spec.startsWith('@/')) absBase = path.join(SRC, spec.slice(2))
  else absBase = path.resolve(path.dirname(fromFile), spec)
  const candidates = []
  if (path.extname(absBase)) candidates.push(absBase)
  else {
    for (const ext of ['.js', '.mjs', '.ts', '.vue']) candidates.push(absBase + ext)
    for (const ext of ['.js', '.mjs', '.ts', '.vue'])
      candidates.push(path.join(absBase, 'index' + ext))
  }
  for (const c of candidates) {
    if (knownByPath.has(c)) return c
    if (await fileExists(c)) return c
  }
  return null
}

// ─── main ────────────────────────────────────────────────────────────────

const allFiles = await walk(SRC)
const files = allFiles.filter(
  (f) => (f.endsWith('.vue') || f.endsWith('.js')) && !f.endsWith('.test.js'),
)

const byPath = new Map()

for (const abs of files) {
  const rel = path.relative(ROOT, abs).replace(/\\/g, '/')
  const text = await fs.readFile(abs, 'utf8')
  const code = abs.endsWith('.vue') ? extractScriptFromVue(text) : text
  const isVue = abs.endsWith('.vue')

  const pinia = extractPiniaActions(code)
  let funcs = extractFunctions(code)

  if (pinia.isStore) {
    const merged = new Map()
    for (const f of funcs) merged.set(f.name, f)
    for (const f of pinia.actions) if (!merged.has(f.name)) merged.set(f.name, f)
    for (const f of pinia.getters) if (!merged.has(f.name)) merged.set(f.name, f)
    const setupNames = extractStoreSetupReturn(code)
    if (setupNames) {
      for (const n of setupNames) if (!merged.has(n)) merged.set(n, { name: n, desc: null })
    }
    funcs = [...merged.values()]
  }

  const imports = extractImports(code)

  byPath.set(abs, {
    abs,
    rel,
    isVue,
    isStore: pinia.isStore,
    id: toId(rel),
    title: shortTitle(rel),
    layer: topLayer(rel),
    funcs,
    imports,
  })
}

const knownByPath = new Set(byPath.keys())
const edges = []
for (const info of byPath.values()) {
  for (const spec of info.imports) {
    const resolved = await resolveImport(spec, info.abs, knownByPath)
    if (!resolved || resolved === info.abs) continue
    const target = byPath.get(resolved)
    if (!target) continue
    edges.push({ from: info.id, to: target.id, fromVue: info.isVue })
  }
}

const incoming = new Map()
const outgoing = new Map()
for (const e of edges) {
  incoming.set(e.to, (incoming.get(e.to) || 0) + 1)
  outgoing.set(e.from, (outgoing.get(e.from) || 0) + 1)
}

// ─── emit YAML ───────────────────────────────────────────────────────────

function colorFor(info) {
  if (info.isStore) return 'orange'
  if (info.isVue) return 'green'
  return 'yellow'
}

function iconFor(info) {
  if (info.isStore) return 'database'
  if (info.isVue) return 'app-window'
  return 'file-text'
}

const LAYER_TITLES = {
  app: 'app · entry',
  shared: 'shared',
  entities: 'entities',
  features: 'features',
  widgets: 'widgets',
  pages: 'pages',
  assets: 'assets',
}
const LAYER_COLORS = {
  app: 'cyan',
  shared: 'gray',
  entities: 'magenta',
  features: 'magenta',
  widgets: 'cyan',
  pages: 'green',
  assets: 'gray',
}

const usedLayers = new Set([...byPath.values()].map((i) => i.layer))

const lines = []
lines.push('# Generated by tools/analyze-pf-forum.mjs')
lines.push('# Project: D:\\GitHub\\modules-soft__pf-forum')
lines.push('# Colors:  .vue=green   .js=yellow   pinia=orange')
lines.push(
  '# Each module exposes:  "in" (incoming imports), function rows, "deps" (outgoing imports).',
)
lines.push('')

lines.push('groups:')
for (const layer of ['app', 'entities', 'features', 'widgets', 'pages', 'shared', 'assets']) {
  if (!usedLayers.has(layer)) continue
  lines.push(
    `  - ${emitInline({ id: layer, title: LAYER_TITLES[layer] || layer, color: LAYER_COLORS[layer] || 'gray' })}`,
  )
}
lines.push('')

lines.push('nodes:')
const sorted = [...byPath.values()].sort((a, b) => a.rel.localeCompare(b.rel))
for (const info of sorted) {
  const color = colorFor(info)
  const icon = iconFor(info)
  const incCount = incoming.get(info.id) || 0
  const outCount = outgoing.get(info.id) || 0

  lines.push(`  - id: ${info.id}`)
  lines.push(`    title: ${yamlEscape(info.title)}`)
  lines.push(`    icon: ${icon}`)
  lines.push(`    group: ${info.layer}`)
  lines.push(`    rows:`)
  lines.push(
    `      - ${emitInline({ id: 'in', icon: 'download', label: 'imported by', value: String(incCount), color, type: 'target' })}`,
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
const seenE = new Set()
for (const e of edges) {
  const key = e.from + '->' + e.to
  if (seenE.has(key)) continue
  seenE.add(key)
  const fromInfo = [...byPath.values()].find((i) => i.id === e.from)
  const color = fromInfo?.isStore ? 'orange' : fromInfo?.isVue ? 'green' : 'yellow'
  lines.push(`  - ${emitInline({ from: `${e.from}.deps`, to: `${e.to}.in`, color })}`)
}

const yaml = lines.join('\n')
const banner = `// AUTO-GENERATED by tools/analyze-pf-forum.mjs
// Source project: D:\\\\GitHub\\\\modules-soft__pf-forum
// Files scanned: ${byPath.size}    Edges: ${edges.length}`

await fs.mkdir(path.dirname(OUT), { recursive: true })
await fs.writeFile(OUT, wrapAsTsDemo('pfForumDemo', yaml, banner), 'utf8')

console.log(
  `[ok] nodes=${byPath.size}  edges=${edges.length}  layers=${[...usedLayers].join(',')}`,
)
console.log(`[ok] wrote ${OUT}`)
