// Smoke-test: parse a generated DSL .ts module with js-yaml,
// check uniqueness of node/row ids and edge integrity.
// Usage:  node tools/verify-dsl.mjs [path/to/demo.ts]
import yaml from '../../modules-soft__pf-forum/node_modules/js-yaml/dist/js-yaml.mjs'
import { promises as fs } from 'node:fs'
import path from 'node:path'

const tsPath = path.resolve(
  process.argv[2] || 'D:/GitHub/glyph/src/demo/pfForumDemo.ts',
)
const ts = await fs.readFile(tsPath, 'utf8')
const m = ts.match(/= `([\s\S]*)`\s*$/)
if (!m) throw new Error('cannot extract DSL from .ts')

// undo our escaping order: $-brace, backtick, then backslash
let dsl = m[1]
dsl = dsl.replace(/\\\$\{/g, '${')
dsl = dsl.replace(/\\`/g, '`')
dsl = dsl.replace(/\\\\/g, '\\')

let doc
try {
  doc = yaml.load(dsl)
} catch (e) {
  console.error('YAML parse failed:', e.message)
  const lines = dsl.split('\n')
  const at = e.mark?.line ?? 0
  for (let i = Math.max(0, at - 3); i < Math.min(lines.length, at + 4); i++) {
    console.error((i === at ? '>>' : '  ') + ' ' + i + ': ' + lines[i])
  }
  process.exit(1)
}

const nodes = doc.nodes || []
const edges = doc.edges || []
const groups = doc.groups || []
const junctions = doc.junctions || []

const ids = new Set()
const groupIds = new Set(groups.map((g) => g.id))
let dupe = 0
let badGroupRef = 0

for (const n of nodes) {
  if (ids.has(n.id)) {
    dupe++
    console.error('DUP node id', n.id)
  }
  ids.add(n.id)
  if (n.group && !groupIds.has(n.group)) {
    badGroupRef++
    console.error(`node "${n.id}".group references unknown group "${n.group}"`)
  }
  if (n.rows) {
    const rids = new Set()
    for (const r of n.rows) {
      if (rids.has(r.id)) console.error('DUP row id in', n.id, ':', r.id)
      rids.add(r.id)
    }
  }
}
for (const j of junctions) {
  if (j.group && !groupIds.has(j.group)) {
    badGroupRef++
    console.error(`junction "${j.id}".group references unknown group "${j.group}"`)
  }
}

const endpointIds = new Set([...ids, ...junctions.map((j) => j.id)])
let dangling = 0
for (const e of edges) {
  const [f] = e.from.split('.')
  const [t] = e.to.split('.')
  if (!endpointIds.has(f)) {
    dangling++
    console.error('edge.from unknown:', e.from)
  }
  if (!endpointIds.has(t)) {
    dangling++
    console.error('edge.to unknown:', e.to)
  }
}

const ok = dupe === 0 && dangling === 0 && badGroupRef === 0
console.log(
  `nodes=${nodes.length} edges=${edges.length} groups=${groups.length} dupes=${dupe} dangling=${dangling} badGroupRef=${badGroupRef}`,
)
if (!ok) process.exit(1)
