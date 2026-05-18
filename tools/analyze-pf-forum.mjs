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

const ROOT = path.resolve('D:/GitHub/modules-soft__pf-forum')
const SRC = path.join(ROOT, 'src')
const OUT = path.resolve('D:/GitHub/glyph/src/demo/pfForumDemo.ts')

// ─── walk ─────────────────────────────────────────────────────────────────────

async function walk(dir) {
  const out = []
  const entries = await fs.readdir(dir, { withFileTypes: true })
  for (const e of entries) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === 'dist' || e.name.startsWith('.')) continue
      out.push(...(await walk(full)))
    } else {
      out.push(full)
    }
  }
  return out
}

// ─── id sanitation ────────────────────────────────────────────────────────────

function toId(rel) {
  // rel like "shared/api/base/apiClient.js"  ->  "shared_api_base_apiClient_js"
  return rel
    .replace(/\\/g, '/')
    .replace(/^src\//, '')
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

function shortTitle(rel) {
  return path.basename(rel)
}

function topLayer(rel) {
  const seg = rel.replace(/\\/g, '/').split('/')[1] // skip "src/"
  return seg || 'misc'
}

// ─── parser ──────────────────────────────────────────────────────────────────

function extractScriptFromVue(text) {
  // gather every <script ...>...</script> block
  const out = []
  const re = /<script[^>]*>([\s\S]*?)<\/script>/g
  let m
  while ((m = re.exec(text))) out.push(m[1])
  return out.join('\n')
}

function stripCommentsAndStrings(src) {
  // crude: strip /* */ comments, // comments, and string literals so we don't
  // false-match function-shaped strings.
  let s = src.replace(/\/\*[\s\S]*?\*\//g, '')
  s = s.replace(/(^|[^:])\/\/[^\n]*/g, '$1')
  s = s.replace(/`(?:\\.|[^`\\])*`/g, '""')
  s = s.replace(/'(?:\\.|[^'\\])*'/g, '""')
  s = s.replace(/"(?:\\.|[^"\\])*"/g, '""')
  return s
}

function uniq(arr) {
  return [...new Set(arr)]
}

// Reserved words we should never treat as user functions
const RESERVED = new Set([
  'if',
  'for',
  'while',
  'switch',
  'return',
  'catch',
  'do',
  'else',
  'function',
  'typeof',
  'in',
  'of',
  'new',
  'delete',
  'void',
  'await',
  'async',
  'yield',
  'true',
  'false',
  'null',
  'undefined',
])

// Given a position in the source, look backwards for the nearest comment that
// describes the upcoming declaration. Returns a short, cleaned-up description
// (or null). Skips blank lines between comment and decl, but stops on code.
function descriptionAbove(rawSrc, pos) {
  // walk back through whitespace to the prev non-ws char
  let i = pos - 1
  while (i >= 0 && /\s/.test(rawSrc[i])) i--
  if (i < 0) return null

  // JSDoc / block comment:  ...*/   <- closing
  if (rawSrc[i] === '/' && rawSrc[i - 1] === '*') {
    // find matching /*
    let j = i - 1
    while (j > 0 && !(rawSrc[j] === '/' && rawSrc[j + 1] === '*')) j--
    if (j < 0) return null
    const block = rawSrc.slice(j + 2, i - 1)
    return cleanBlockComment(block)
  }

  // line comments ( //... ), possibly several lines stacked
  // walk back lines while they start with //
  const lineEnd = i + 1
  // find start of current line
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
    .filter((l) => l && !l.startsWith('@')) // drop @param/@returns/etc.
  if (lines.length === 0) return null
  return clipDesc(lines[0])
}

function clipDesc(s) {
  s = s.replace(/\s+/g, ' ').trim()
  // drop trailing punctuation
  s = s.replace(/[.;,:]+$/, '')
  // strip line-comment markers and ✅/emoji that pollute many files
  s = s.replace(/^[✅✔️•\-—–]\s*/, '').trim()
  if (s.length > 48) s = s.slice(0, 45).trim() + '…'
  return s || null
}

function extractFunctions(rawCode) {
  // Run regexes against a string with strings & template literals neutralized
  // (so we don't pick up `"function X"` literals), but keep COMMENTS intact so
  // their positions still align with the source we use for descriptionAbove.
  // For description lookup we'll use the raw source.
  const stringMasked = (() => {
    let s = rawCode
    s = s.replace(/`(?:\\.|[^`\\])*`/g, (m) => '`' + ' '.repeat(m.length - 2) + '`')
    s = s.replace(/'(?:\\.|[^'\\])*'/g, (m) => "'" + ' '.repeat(m.length - 2) + "'")
    s = s.replace(/"(?:\\.|[^"\\])*"/g, (m) => '"' + ' '.repeat(m.length - 2) + '"')
    return s
  })()

  const found = new Map() // name -> { name, desc }

  function push(name, pos) {
    if (RESERVED.has(name) || name.length <= 1) return
    if (found.has(name)) return
    const desc = descriptionAbove(rawCode, pos)
    found.set(name, { name, desc })
  }

  for (const m of stringMasked.matchAll(
    /\b(?:export\s+(?:default\s+)?)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g,
  )) {
    push(m[1], m.index)
  }
  for (const m of stringMasked.matchAll(
    /\b(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/g,
  )) {
    push(m[1], m.index)
  }

  return [...found.values()]
}

function extractPiniaActions(rawCode) {
  // Find `actions: { ... }` / `getters: { ... }` blocks inside defineStore(...).
  // Position-preserving on the raw source so descriptionAbove() can find JSDoc.
  if (!/defineStore\s*\(/.test(rawCode))
    return { isStore: false, actions: [], getters: [], state: [] }

  // Mask strings only (keep comments + offsets) for the structural search.
  let src = rawCode
  src = src.replace(/`(?:\\.|[^`\\])*`/g, (m) => '`' + ' '.repeat(m.length - 2) + '`')
  src = src.replace(/'(?:\\.|[^'\\])*'/g, (m) => "'" + ' '.repeat(m.length - 2) + "'")
  src = src.replace(/"(?:\\.|[^"\\])*"/g, (m) => '"' + ' '.repeat(m.length - 2) + '"')

  function blockBetween(label) {
    const re = new RegExp(`\\b${label}\\s*:\\s*\\{`, 'g')
    const m = re.exec(src)
    if (!m) return null
    let depth = 0
    let start = m.index + m[0].length - 1 // position of '{'
    for (let i = start; i < src.length; i++) {
      if (src[i] === '{') depth++
      else if (src[i] === '}') {
        depth--
        if (depth === 0) return { from: start + 1, to: i }
      }
    }
    return null
  }

  const grab = (range) => {
    if (!range) return []
    const block = src.slice(range.from, range.to)
    const out = new Map()
    // method shorthand
    for (const m of block.matchAll(
      /(?:^|[\n,{])(\s*)(?:async\s+)?([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/g,
    )) {
      const name = m[2]
      if (RESERVED.has(name)) continue
      // absolute position of name in raw source ≈ range.from + m.index + m[1].length + …
      // simpler: find name's first occurrence within the original code near range.from.
      const absMatchStart = range.from + m.index
      const desc = descriptionAbove(rawCode, absMatchStart)
      if (!out.has(name)) out.set(name, { name, desc })
    }
    // arrow form
    for (const m of block.matchAll(/(?:^|[\n,{])\s*([A-Za-z_$][\w$]*)\s*:\s*(?:async\s*)?\(/g)) {
      const name = m[1]
      if (RESERVED.has(name)) continue
      const absMatchStart = range.from + m.index
      const desc = descriptionAbove(rawCode, absMatchStart)
      if (!out.has(name)) out.set(name, { name, desc })
    }
    return [...out.values()]
  }

  return {
    isStore: true,
    actions: grab(blockBetween('actions')),
    getters: grab(blockBetween('getters')),
    state: [],
  }
}

function extractStoreSetupReturn(rawCode) {
  // For `defineStore('name', () => { ... return { a, b, c } })` form.
  // Returns array of names (no descriptions — comments live next to the
  // function definitions, which the regular extractor already covers).
  const src = stripCommentsAndStrings(rawCode)
  if (!/defineStore\s*\(\s*['"][^'"]+['"]\s*,\s*\(\s*\)\s*=>/.test(src)) return null
  const re = /return\s*\{([^}]*)\}/g
  const names = []
  let m
  while ((m = re.exec(src))) {
    const inner = m[1]
    for (const t of inner.split(',')) {
      const n = t.trim().split(/[:\s]/)[0]
      if (n && /^[A-Za-z_$][\w$]*$/.test(n) && !RESERVED.has(n)) names.push(n)
    }
  }
  return names.length ? uniq(names) : null
}

function extractImports(code) {
  // returns array of raw paths (specifiers)
  // NOTE: must run on RAW code (not string-stripped), or specifiers vanish.
  // Strip only /* */ and // comments so we don't grab commented-out imports.
  let src = code.replace(/\/\*[\s\S]*?\*\//g, '')
  src = src.replace(/(^|[^:])\/\/[^\n]*/g, '$1')
  const out = []
  for (const m of src.matchAll(/\bimport\s+(?:[\s\S]+?\s+from\s+)?['"]([^'"]+)['"]/g)) {
    out.push(m[1])
  }
  for (const m of src.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    out.push(m[1])
  }
  for (const m of src.matchAll(/\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    out.push(m[1])
  }
  return uniq(out)
}

// ─── resolve ─────────────────────────────────────────────────────────────────

async function fileExists(p) {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

async function resolveImport(spec, fromFile, knownByPath) {
  // returns the rel path inside src/ (without ext) of the resolved file, or null
  if (!spec) return null
  if (!spec.startsWith('.') && !spec.startsWith('@/')) return null // external

  let absBase
  if (spec.startsWith('@/')) {
    absBase = path.join(SRC, spec.slice(2))
  } else {
    absBase = path.resolve(path.dirname(fromFile), spec)
  }

  const candidates = []
  if (path.extname(absBase)) {
    candidates.push(absBase)
  } else {
    for (const ext of ['.js', '.mjs', '.ts', '.vue']) candidates.push(absBase + ext)
    for (const ext of ['.js', '.mjs', '.ts', '.vue']) candidates.push(path.join(absBase, 'index' + ext))
  }

  for (const c of candidates) {
    if (knownByPath.has(c)) return c
    if (await fileExists(c)) return c
  }
  return null
}

// ─── main ─────────────────────────────────────────────────────────────────────

const files = (await walk(SRC)).filter(
  (f) => (f.endsWith('.vue') || f.endsWith('.js')) && !f.endsWith('.test.js'),
)

const byPath = new Map() // absPath -> info

for (const abs of files) {
  const rel = path.relative(ROOT, abs).replace(/\\/g, '/')
  const text = await fs.readFile(abs, 'utf8')

  const code = abs.endsWith('.vue') ? extractScriptFromVue(text) : text
  const isVue = abs.endsWith('.vue')

  const pinia = extractPiniaActions(code)
  let funcs = extractFunctions(code) // [{name, desc}]

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

// Resolve imports to known files (internal edges only)
const knownByPath = new Set(byPath.keys())
const edges = []
for (const info of byPath.values()) {
  for (const spec of info.imports) {
    const resolved = await resolveImport(spec, info.abs, knownByPath)
    if (!resolved) continue
    if (resolved === info.abs) continue
    const target = byPath.get(resolved)
    if (!target) continue
    edges.push({ from: info.id, to: target.id, fromVue: info.isVue, toVue: target.isVue })
  }
}

// ─── compute incoming/outgoing counts ────────────────────────────────────────
const incoming = new Map()
const outgoing = new Map()
for (const e of edges) {
  incoming.set(e.to, (incoming.get(e.to) || 0) + 1)
  outgoing.set(e.from, (outgoing.get(e.from) || 0) + 1)
}

// ─── emit YAML ────────────────────────────────────────────────────────────────

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
    if (typeof v === 'object') {
      parts.push(`${k}: ${emitInline(v)}`)
    } else if (typeof v === 'string') {
      parts.push(`${k}: ${yamlEscape(v)}`)
    } else {
      parts.push(`${k}: ${v}`)
    }
  }
  return `{ ${parts.join(', ')} }`
}

const lines = []
lines.push('# Generated by tools/analyze-pf-forum.mjs')
lines.push('# Project: D:\\GitHub\\modules-soft__pf-forum')
lines.push('# Colors:  .vue=green   .js=yellow   pinia=orange')
lines.push('# Each module exposes:  "in" (incoming imports), function rows, "deps" (outgoing imports).')
lines.push('')

// groups
lines.push('groups:')
for (const layer of ['app', 'entities', 'features', 'widgets', 'pages', 'shared', 'assets']) {
  if (!usedLayers.has(layer)) continue
  lines.push(
    `  - ${emitInline({ id: layer, title: LAYER_TITLES[layer] || layer, color: LAYER_COLORS[layer] || 'gray' })}`,
  )
}
lines.push('')

// nodes
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

  // function rows — dedupe row ids
  const seen = new Set(['in', 'deps'])
  for (const fn of info.funcs) {
    let rid = rowId(fn.name)
    let suffix = 1
    while (seen.has(rid)) {
      rid = rowId(fn.name) + '_' + suffix++
    }
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

// edges
lines.push('edges:')
// dedupe edges
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

// Write as TS module
const banner = `// AUTO-GENERATED by tools/analyze-pf-forum.mjs
// Source project: D:\\\\GitHub\\\\modules-soft__pf-forum
// Files scanned: ${byPath.size}    Edges: ${edges.length}
`
const ts =
  banner +
  '\nexport const pfForumDemo = ' +
  '`' +
  yaml.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${') +
  '`\n'

await fs.mkdir(path.dirname(OUT), { recursive: true })
await fs.writeFile(OUT, ts, 'utf8')

console.log(
  `[ok] nodes=${byPath.size}  edges=${edges.length}  layers=${[...usedLayers].join(',')}`,
)
console.log(`[ok] wrote ${OUT}`)
