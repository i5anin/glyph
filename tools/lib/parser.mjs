// Shared parsing utilities for project analyzers.
// Both analyze-pf-forum.mjs (ES-modules) and analyze-soft-pfforum.mjs
// (window-globals) lean on this lib; specific extractors (pinia, vue methods,
// window-globals, import resolution) live alongside the analyzers themselves.

import { promises as fs } from 'node:fs'
import path from 'node:path'

// ─── Filesystem walk ─────────────────────────────────────────────────────

/**
 * Recursively walk a directory. Returns absolute file paths (no dirs).
 * @param {string} dir
 * @param {(name: string, full: string) => boolean} [skipDir]  optional dir filter
 *   — return true to skip the dir. Default skips node_modules, dist, dotdirs.
 * @returns {Promise<string[]>}
 */
export async function walk(dir, skipDir) {
  const skip =
    skipDir ??
    ((name) =>
      name === 'node_modules' || name === 'dist' || name.startsWith('.'))
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
      if (skip(e.name, full)) continue
      out.push(...(await walk(full, skipDir)))
    } else {
      out.push(full)
    }
  }
  return out
}

// ─── Identifier sanitation ───────────────────────────────────────────────

/** Convert a relative path (or any string) into a stable [a-zA-Z0-9_] id. */
export function toId(s) {
  return s
    .replace(/\\/g, '/')
    .replace(/^src\//, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

/** Sanitize a function/row name into a glyph row id (≤40 chars). */
export function rowId(name) {
  return (
    name
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40) || 'fn'
  )
}

// ─── YAML emit helpers ───────────────────────────────────────────────────

/**
 * Quote a string if it contains YAML-special characters or leading/trailing ws.
 * Plain unicode (including Cyrillic and middle-dot) is emitted unquoted.
 */
export function yamlEscape(s) {
  if (s === '' || /[:#&*!|>'"%@`{}\[\],?\-]/.test(s) || /^\s|\s$/.test(s)) {
    return JSON.stringify(s)
  }
  return s
}

/** Render an object as a one-line YAML flow mapping `{ k: v, … }`. */
export function emitInline(obj) {
  const parts = []
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue
    if (typeof v === 'object') parts.push(`${k}: ${emitInline(v)}`)
    else if (typeof v === 'string') parts.push(`${k}: ${yamlEscape(v)}`)
    else parts.push(`${k}: ${v}`)
  }
  return `{ ${parts.join(', ')} }`
}

// ─── Source masking ──────────────────────────────────────────────────────

/**
 * Replace strings & template literals with empty quotes and strip comments.
 * Preserves offsets when used to find structural patterns; for offset-sensitive
 * lookups (descriptionAbove), use stripStringsKeepingPositions().
 */
export function stripCommentsAndStrings(src) {
  let s = src.replace(/\/\*[\s\S]*?\*\//g, '')
  s = s.replace(/(^|[^:])\/\/[^\n]*/g, '$1')
  s = s.replace(/`(?:\\.|[^`\\])*`/g, '""')
  s = s.replace(/'(?:\\.|[^'\\])*'/g, '""')
  s = s.replace(/"(?:\\.|[^"\\])*"/g, '""')
  return s
}

/**
 * Mask strings/templates to same-length whitespace, preserving char offsets.
 * Comments are LEFT INTACT so descriptionAbove() can still find them.
 */
export function maskStringsKeepingPositions(src) {
  let s = src
  s = s.replace(/`(?:\\.|[^`\\])*`/g, (m) => '`' + ' '.repeat(m.length - 2) + '`')
  s = s.replace(/'(?:\\.|[^'\\])*'/g, (m) => "'" + ' '.repeat(m.length - 2) + "'")
  s = s.replace(/"(?:\\.|[^"\\])*"/g, (m) => '"' + ' '.repeat(m.length - 2) + '"')
  return s
}

// ─── Description-from-comment extraction ─────────────────────────────────

/**
 * Look at the raw source just before `pos` for a JSDoc block or a `// line`
 * comment and return a short clean description, or null.
 *
 * Run against the ORIGINAL source (positions matter; comments must be intact).
 */
export function descriptionAbove(rawSrc, pos) {
  // walk back through whitespace
  let i = pos - 1
  while (i >= 0 && /\s/.test(rawSrc[i])) i--
  if (i < 0) return null

  // JSDoc / block comment ending in */
  if (rawSrc[i] === '/' && rawSrc[i - 1] === '*') {
    let j = i - 1
    while (j > 0 && !(rawSrc[j] === '/' && rawSrc[j + 1] === '*')) j--
    if (j < 0) return null
    const block = rawSrc.slice(j + 2, i - 1)
    return cleanBlockComment(block)
  }

  // single-line // comment immediately above
  const lineEnd = i + 1
  let ls = lineEnd
  while (ls > 0 && rawSrc[ls - 1] !== '\n') ls--
  const lastLine = rawSrc.slice(ls, lineEnd).trim()
  const m = lastLine.match(/^\/\/\s?(.*)$/)
  if (!m) return null
  return clipDesc(m[1])
}

/** Take the first meaningful line of a /* … *​/ block (strip leading *, @-tags). */
export function cleanBlockComment(block) {
  const lines = block
    .split('\n')
    .map((l) => l.replace(/^\s*\*\s?/, '').trim())
    .filter((l) => l && !l.startsWith('@'))
  if (lines.length === 0) return null
  return clipDesc(lines[0])
}

/** Normalize whitespace, drop trailing punctuation, strip emoji bullets, clip. */
export function clipDesc(s) {
  s = s.replace(/\s+/g, ' ').trim()
  s = s.replace(/[.;,:]+$/, '')
  s = s.replace(/^[✅✔️•\-—–]\s*/, '').trim()
  if (s.length > 48) s = s.slice(0, 45).trim() + '…'
  return s || null
}

// ─── Reserved words & built-in globals ───────────────────────────────────

export const JS_RESERVED = new Set([
  'if', 'for', 'while', 'switch', 'return', 'catch', 'do', 'else',
  'function', 'typeof', 'in', 'of', 'new', 'delete', 'void', 'await',
  'async', 'yield', 'true', 'false', 'null', 'undefined',
])

/** Built-in window properties we never want to treat as user dependencies. */
export const WINDOW_BUILTINS = new Set([
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
  'closed', 'frames', 'length', 'origin', 'getSelection', 'queueMicrotask',
  'requestIdleCallback', 'cancelIdleCallback', 'scrollTo', 'scrollBy',
  'btoa', 'atob', 'structuredClone',
])

// ─── Function-name extraction (ES modules / generic JS) ──────────────────

/**
 * Find user-defined functions and return [{ name, desc }].
 * Captures:
 *   - function NAME(…)        (incl. async, export, export default)
 *   - const NAME = (…) => …   (incl. let/var, async, export)
 * `desc` is pulled from the closest JSDoc / line comment via descriptionAbove.
 */
export function extractFunctions(rawCode) {
  const masked = maskStringsKeepingPositions(rawCode)
  const found = new Map()

  function push(name, pos) {
    if (JS_RESERVED.has(name) || name.length <= 1) return
    if (found.has(name)) return
    const desc = descriptionAbove(rawCode, pos)
    found.set(name, { name, desc })
  }

  for (const m of masked.matchAll(
    /\b(?:export\s+(?:default\s+)?)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g,
  )) {
    push(m[1], m.index)
  }
  for (const m of masked.matchAll(
    /\b(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/g,
  )) {
    push(m[1], m.index)
  }
  return [...found.values()]
}

// ─── Import detection (ES modules) ───────────────────────────────────────

/**
 * Extract import specifiers from raw source: static `import … from "…"`,
 * dynamic `import("…")`, and `require("…")`. Strips comments first so we
 * don't pick up commented-out imports; keeps string content intact.
 */
export function extractImports(rawCode) {
  let src = rawCode.replace(/\/\*[\s\S]*?\*\//g, '')
  src = src.replace(/(^|[^:])\/\/[^\n]*/g, '$1')
  const out = new Set()
  for (const m of src.matchAll(/\bimport\s+(?:[\s\S]+?\s+from\s+)?['"]([^'"]+)['"]/g)) {
    out.add(m[1])
  }
  for (const m of src.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    out.add(m[1])
  }
  for (const m of src.matchAll(/\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    out.add(m[1])
  }
  return [...out]
}

// ─── Window-globals detection (legacy script-tag style) ──────────────────

/** Names assigned via `window.NAME = …` (the file's "exports"). */
export function extractWindowDefs(rawCode) {
  const masked = stripCommentsAndStrings(rawCode)
  const out = new Set()
  for (const m of masked.matchAll(/\bwindow\.([A-Za-z_$][\w$]*)\s*=/g)) {
    out.add(m[1])
  }
  return [...out]
}

/** Names referenced via any `window.NAME` (raw set — caller should subtract own defs and built-ins). */
export function extractWindowRefs(rawCode) {
  const masked = stripCommentsAndStrings(rawCode)
  const out = new Set()
  for (const m of masked.matchAll(/\bwindow\.([A-Za-z_$][\w$]*)\b/g)) {
    out.add(m[1])
  }
  return [...out]
}

// ─── Object-block scanning (for pinia actions / Vue methods) ─────────────

/**
 * Locate the body range `{ … }` of a `LABEL: { … }` block inside the given
 * (string-masked, comments-preserved) source. Returns { from, to } byte
 * offsets of the inner content, or null if not found.
 *
 * @param {string} src         string-masked source (offsets preserved)
 * @param {string} label       outer label e.g. "methods", "actions"
 * @param {number} [startFrom] only look at or after this offset
 */
export function findLabeledBlock(src, label, startFrom = 0) {
  const re = new RegExp(`\\b${label}\\s*:\\s*\\{`, 'g')
  re.lastIndex = startFrom
  const m = re.exec(src)
  if (!m) return null
  let depth = 0
  const start = m.index + m[0].length - 1 // position of '{'
  for (let i = start; i < src.length; i++) {
    if (src[i] === '{') depth++
    else if (src[i] === '}') {
      depth--
      if (depth === 0) return { from: start + 1, to: i }
    }
  }
  return null
}

/**
 * Extract method-shorthand and arrow-form keys from a `{ … }` block range.
 * Returns [{ name, desc }] with descriptions resolved against rawCode.
 */
export function extractBlockMembers(rawCode, maskedSrc, range) {
  if (!range) return []
  const block = maskedSrc.slice(range.from, range.to)
  const found = new Map()

  // method shorthand:  foo(…) { … }  /  async foo(…) { … }
  for (const m of block.matchAll(
    /(?:^|[\n,{])(\s*)(?:async\s+)?([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/g,
  )) {
    const name = m[2]
    if (JS_RESERVED.has(name)) continue
    const absPos = range.from + m.index
    const desc = descriptionAbove(rawCode, absPos)
    if (!found.has(name)) found.set(name, { name, desc })
  }

  // arrow form:  foo: (…) => …
  for (const m of block.matchAll(/(?:^|[\n,{])\s*([A-Za-z_$][\w$]*)\s*:\s*(?:async\s*)?\(/g)) {
    const name = m[1]
    if (JS_RESERVED.has(name)) continue
    const absPos = range.from + m.index
    const desc = descriptionAbove(rawCode, absPos)
    if (!found.has(name)) found.set(name, { name, desc })
  }

  return [...found.values()]
}

// ─── TS demo serialization ───────────────────────────────────────────────

/**
 * Wrap a YAML string into an `export const NAME = \`…\`` TypeScript module,
 * escaping the three sequences that would break the template literal.
 */
export function wrapAsTsDemo(name, yaml, banner = '') {
  return (
    (banner ? banner + '\n' : '') +
    `export const ${name} = \`` +
    yaml.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${') +
    '`\n'
  )
}
