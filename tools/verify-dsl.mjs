// Quick smoke-test: parse the generated DSL with js-yaml, check uniqueness
// and edge integrity. No Vue Flow involved.
import yaml from '../../modules-soft__pf-forum/node_modules/js-yaml/dist/js-yaml.mjs'
import { promises as fs } from 'node:fs'
import path from 'node:path'

const tsPath = path.resolve('D:/GitHub/glyph/src/demo/pfForumDemo.ts')
const ts = await fs.readFile(tsPath, 'utf8')
const m = ts.match(/export const pfForumDemo = `([\s\S]*)`\s*$/)
if (!m) throw new Error('cannot extract DSL from .ts')
// undo our escaping
const dsl = m[1].replace(/\\`/g, '`').replace(/\\\$\{/g, '${').replace(/\\\\/g, '\\')

let doc
try {
  doc = yaml.load(dsl)
} catch (e) {
  console.error('YAML parse failed:', e.message)
  // dump a window
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

const ids = new Set()
let dupe = 0
for (const n of nodes) {
  if (ids.has(n.id)) {
    dupe++
    console.error('DUP node id', n.id)
  }
  ids.add(n.id)
  if (n.rows) {
    const rids = new Set()
    for (const r of n.rows) {
      if (rids.has(r.id)) console.error('DUP row id in', n.id, ':', r.id)
      rids.add(r.id)
    }
  }
}

let dangling = 0
for (const e of edges) {
  const [f] = e.from.split('.')
  const [t] = e.to.split('.')
  if (!ids.has(f)) {
    dangling++
    console.error('edge.from unknown:', e.from)
  }
  if (!ids.has(t)) {
    dangling++
    console.error('edge.to unknown:', e.to)
  }
}

console.log(`nodes=${nodes.length} edges=${edges.length} groups=${groups.length} dupes=${dupe} dangling=${dangling}`)
