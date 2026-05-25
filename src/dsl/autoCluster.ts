// ─────────────────────────────────────────────────────────────────────────
//  Auto-clustering by reachability.
//
//  Replaces category-based groups (pages / widgets / shared / ...) with
//  page-centric ones: for every entry node we BFS through outgoing edges
//  and assign each reached node to either:
//   • the entry's group (when only ONE entry can reach it), or
//   • a synthetic "_shared" group (when MULTIPLE entries reach it).
//
//  Entries detection rules, in order of priority:
//    1. Explicit `entry: true` on the node.
//    2. Node id matches /(^form\d+\.php$|-app\.js$|^_render\.php$)/.
//    3. Fallback — nodes with no incoming edges (DAG roots).
//
//  Result: original DSL is left untouched; we return a NEW ObstructionDoc
//  with overridden groups/nodes/junctions ready for `toFlow`.
// ─────────────────────────────────────────────────────────────────────────

import type {
  AccentColor,
  GroupSpec,
  JunctionSpec,
  NodeSpec,
  ObstructionDoc,
} from './schema'

const SHARED_GROUP_ID = '_shared'
const SHARED_GROUP_TITLE = 'shared · общие компоненты'
const ENTRY_PATTERN = /^form\d+\.php$|-app\.js$|^_render\.php$/

// Узнать, проектируется ли DSL по FSD-методологии (Feature-Sliced Design).
// Если хоть одна группа называется как FSD-слой — autoCluster надо
// пропустить, иначе он сотрёт `pages`/`widgets`/`shared` в синтетические
// `_entry__*` / `_shared`, и FSD-партиционирование в toFlow.ts не сработает.
const FSD_GROUP_PATTERN =
  /^(app|application|main|root|entry|entries|template|templates|processes|process|flows|pages|page|views|screens|widgets|widget|panels|features|feature|fts|entities|entity|models|domain|shared|lib|libs|library|libraries|kit|ui|api|stores|store|misc|utils|util|helpers|plugins|vendor|core)(_|$|-)/i

export function hasFsdGroups(doc: ObstructionDoc): boolean {
  return (doc.groups ?? []).some((g) => FSD_GROUP_PATTERN.test(g.id))
}

/**
 * Прозрачная обёртка: если документ уже расписан по FSD-слоям —
 * возвращаем его без изменений (toFlow.ts сам положит партиции по FSD).
 * Иначе запускаем reachability-кластеризацию.
 */
export function clusterIfNeeded(doc: ObstructionDoc): ObstructionDoc {
  if (hasFsdGroups(doc)) return doc
  return autoClusterByReachability(doc)
}

const PALETTE: AccentColor[] = ['cyan', 'green', 'magenta', 'orange', 'yellow']

interface ClusterResult extends ObstructionDoc {
  /** ids of entry nodes (left-most column) */
  __entryIds: Set<string>
}

export function autoClusterByReachability(doc: ObstructionDoc): ClusterResult {
  const nodeIds = new Set(doc.nodes.map((n) => n.id))
  const junctionIds = new Set((doc.junctions ?? []).map((j) => j.id))

  // Build adjacency: node → outgoing node ids (junctions are pass-through).
  const out = new Map<string, Set<string>>()
  const incoming = new Map<string, number>()
  for (const id of nodeIds) out.set(id, new Set())
  for (const id of junctionIds) out.set(id, new Set())

  for (const e of doc.edges) {
    const [fromHead] = e.from.split('.')
    const [toHead] = e.to.split('.')
    if (!fromHead || !toHead) continue
    out.get(fromHead)?.add(toHead)
    incoming.set(toHead, (incoming.get(toHead) ?? 0) + 1)
  }

  // ── 1. Detect entries ─────────────────────────────────────────────────
  const entryIds = new Set<string>()
  for (const n of doc.nodes) {
    if (n.entry === true) entryIds.add(n.id)
  }
  if (entryIds.size === 0) {
    for (const n of doc.nodes) {
      if (ENTRY_PATTERN.test(n.id)) entryIds.add(n.id)
    }
  }
  if (entryIds.size === 0) {
    for (const n of doc.nodes) {
      if (!incoming.has(n.id)) entryIds.add(n.id)
    }
  }
  if (entryIds.size === 0 && doc.nodes.length > 0) {
    entryIds.add(doc.nodes[0]!.id)
  }

  // ── 2. BFS из каждой entry: собираем reachable set per entry ──────────
  const reachers = new Map<string, Set<string>>()
  for (const entry of entryIds) {
    const visited = new Set<string>([entry])
    const queue: string[] = [entry]
    while (queue.length) {
      const cur = queue.shift()!
      for (const next of out.get(cur) ?? []) {
        if (visited.has(next)) continue
        visited.add(next)
        queue.push(next)
      }
    }
    for (const v of visited) {
      let s = reachers.get(v)
      if (!s) {
        s = new Set()
        reachers.set(v, s)
      }
      s.add(entry)
    }
  }

  // ── 3. Назначаем группы ───────────────────────────────────────────────
  const entryGroupId = (entry: string) => `_entry__${entry}`

  const usedEntries = new Set<string>()
  for (const set of reachers.values()) {
    if (set.size === 1) {
      for (const e of set) usedEntries.add(e)
    }
  }
  for (const e of entryIds) usedEntries.add(e)

  let hasShared = false
  const nodeGroupOf = new Map<string, string>()
  for (const n of doc.nodes) {
    const s = reachers.get(n.id)
    if (!s || s.size === 0) {
      hasShared = true
      nodeGroupOf.set(n.id, SHARED_GROUP_ID)
      continue
    }
    if (s.size === 1) {
      const onlyEntry = [...s][0]!
      nodeGroupOf.set(n.id, entryGroupId(onlyEntry))
    } else {
      hasShared = true
      nodeGroupOf.set(n.id, SHARED_GROUP_ID)
    }
  }

  const junctionGroupOf = new Map<string, string>()
  for (const j of doc.junctions ?? []) {
    const groups = new Set<string>()
    for (const e of doc.edges) {
      const [fromHead] = e.from.split('.')
      const [toHead] = e.to.split('.')
      if (fromHead === j.id && toHead && nodeGroupOf.has(toHead)) {
        groups.add(nodeGroupOf.get(toHead)!)
      }
      if (toHead === j.id && fromHead && nodeGroupOf.has(fromHead)) {
        groups.add(nodeGroupOf.get(fromHead)!)
      }
    }
    if (groups.size === 1) junctionGroupOf.set(j.id, [...groups][0]!)
    else {
      hasShared = true
      junctionGroupOf.set(j.id, SHARED_GROUP_ID)
    }
  }

  // ── 4. Build new GroupSpec list ───────────────────────────────────────
  const newGroups: GroupSpec[] = []
  let pi = 0
  for (const entry of [...usedEntries].sort()) {
    const node = doc.nodes.find((n) => n.id === entry)
    const title = node?.title ?? entry
    newGroups.push({
      id: entryGroupId(entry),
      title,
      color: PALETTE[pi % PALETTE.length]!,
      entry: true,
      partition: 0,
    })
    pi++
  }
  if (hasShared) {
    newGroups.push({
      id: SHARED_GROUP_ID,
      title: SHARED_GROUP_TITLE,
      color: 'gray',
      // Pin shared sinks to rightmost partition so cross-entry deps flow
      // left → right cleanly.
      partition: 99,
    })
  }

  // ── 5. Rewrite node.group + node.partition ────────────────────────────
  const newNodes: NodeSpec[] = doc.nodes.map((n) => {
    const targetGroup = nodeGroupOf.get(n.id) ?? n.group
    let partition: number | undefined
    if (entryIds.has(n.id)) partition = 0
    else if (targetGroup === SHARED_GROUP_ID) partition = 99
    return {
      ...n,
      group: targetGroup,
      ...(partition !== undefined ? { partition } : {}),
    }
  })
  const newJunctions: JunctionSpec[] = (doc.junctions ?? []).map((j) => ({
    ...j,
    group: junctionGroupOf.get(j.id) ?? j.group,
  }))

  return {
    nodes: newNodes,
    edges: doc.edges,
    junctions: newJunctions,
    groups: newGroups,
    __entryIds: entryIds,
  }
}
