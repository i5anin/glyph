import ELK from 'elkjs/lib/elk.bundled.js'
import type { ElkNode, ElkExtendedEdge, ElkEdgeSection } from 'elkjs/lib/elk-api'
import type { Edge, Node } from '@vue-flow/core'
import type { ObstructionDoc, NodeSpec } from './schema'

const NODE_WIDTH = 240
const ROW_HEIGHT = 44
const HEADER_HEIGHT = 42
const PROGRESS_HEIGHT = 48
const FOOTER_HEIGHT = 48
// Collapsed-card height: 30px header + 2 compact rows (~20px each + borders)
const COLLAPSED_HEIGHT = 72
const JUNCTION_SIZE = 16

function estimateHeight(node: NodeSpec, isCollapsed: boolean): number {
  if (isCollapsed) return COLLAPSED_HEIGHT
  let h = HEADER_HEIGHT
  h += (node.rows?.length ?? 0) * ROW_HEIGHT
  if (node.progress) h += PROGRESS_HEIGHT
  if (node.footer) h += FOOTER_HEIGHT
  return h
}

export interface FlowGraph {
  nodes: Node[]
  edges: Edge[]
}

type EndpointKind = 'node' | 'junction'

function parseEndpoint(
  ref: string,
  junctionIds: Set<string>,
): { kind: EndpointKind; nodeId: string; rowOrSide: string } {
  const [head, tail] = ref.split('.')
  if (!head) throw new Error(`bad endpoint ref "${ref}"`)
  if (junctionIds.has(head)) {
    return { kind: 'junction', nodeId: head, rowOrSide: tail ?? 'auto' }
  }
  return { kind: 'node', nodeId: head, rowOrSide: tail ?? '' }
}

const elk = new ELK()

// ─────────────────────────────────────────────────────────────────────────────
// LAYOUT STRATEGY — World of Tanks tech-tree look.
//
// Главная идея: строгие колонки-тиры слева направо.
//   • Каждая нода получает явный `elk.partitioning.partition` — её longest-
//     path-distance от любой entry-ноды. Тир 0 = entries, тир N = самая
//     длинная цепочка зависимостей.
//   • Группы НЕ создают компаунд-обёрток на ELK-уровне (компаунды ломали
//     выравнивание колонок и плодили hairball). Группы остаются метаданными,
//     визуально не рендерятся как контейнеры.
//   • Layered LR + LONGEST_PATH + BRANDES_KOEPF + IMPROVE_STRAIGHTNESS даёт
//     минимум изломов и пересечений внутри колонки.
//
// Если потом захочется вернуть compound-режим — см. git history до коммита,
// где появился computeTierPartitions().
// ─────────────────────────────────────────────────────────────────────────────

const ROOT_OPTIONS: Record<string, string> = {
  'elk.algorithm': 'layered',
  'elk.direction': 'RIGHT',
  // ORTHOGONAL — строго 90°, классический WoT-tech-tree.
  // Раньше казалось что POLYLINE спасёт от плотности — но диагонали
  // ломают tier-look. Лучше широкие колонки + ELK-bend-points (см. фикс
  // в FlowEdge.vue: bendsAreFresh теперь true даже на свёрнутых нодах).
  'elk.edgeRouting': 'ORTHOGONAL',

  // Жёсткие тиры. Партиция выставляется per-node ниже (longest-path).
  'elk.partitioning.activate': 'true',

  // Longest-path: каждая нода сидит на максимальной дистанции от entry.
  // LONGEST_PATH + per-node `layerChoiceConstraint` (см. ниже): когда у
  // ноды есть FSD-tier — она прибивается к слою N, longest-path
  // вычисляет позицию ТОЛЬКО для остальных.
  'elk.layered.layering.strategy': 'LONGEST_PATH',
  'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
  'elk.layered.nodePlacement.bk.fixedAlignment': 'BALANCED',
  'elk.layered.nodePlacement.bk.edgeStraightening': 'IMPROVE_STRAIGHTNESS',

  // Crossing reduction
  'elk.layered.thoroughness': '20',
  'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
  'elk.layered.crossingMinimization.greedySwitch.type': 'TWO_SIDED',
  'elk.layered.cycleBreaking.strategy': 'GREEDY',
  'elk.layered.unnecessaryBendpoints': 'true',

  // Колонки-тиры широко разнесены, между нодами внутри колонки воздух
  // (как в WoT: колонка тира большая, ряды танков с хорошим зазором).
  'elk.layered.spacing.nodeNodeBetweenLayers': '200',
  'elk.spacing.nodeNode': '36',
  'elk.spacing.edgeNode': '28',
  'elk.spacing.edgeEdge': '14',
  'elk.layered.spacing.edgeNodeBetweenLayers': '40',
  'elk.layered.spacing.edgeEdgeBetweenLayers': '18',

  // Несвязные подграфы — рядом, не один над другим.
  'elk.separateConnectedComponents': 'true',
  'elk.spacing.componentComponent': '60',
}

// «Оптимизация путей» — отдельный профиль с агрессивным crossing-minimization,
// бóльшими отступами и максимальной thoroughness. Считается медленнее
// (~10-30× обычного на больших графах), вызывается только по кнопке.
const OPTIMIZE_OPTIONS: Record<string, string> = {
  ...ROOT_OPTIONS,
  // thoroughness: 1=fast / 7=default / 100=max
  'elk.layered.thoroughness': '100',
  // Crossing minimization — multi-pass layer sweep + greedy switch
  'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
  'elk.layered.crossingMinimization.semiInteractive': 'false',
  'elk.layered.crossingMinimization.greedySwitch.type': 'TWO_SIDED',
  'elk.layered.crossingMinimization.greedySwitch.activationThreshold': '40',
  // Cycle breaking + feedback edges — чистая укладка циклов
  'elk.layered.cycleBreaking.strategy': 'GREEDY',
  'elk.layered.feedbackEdges': 'true',
  // Удалить лишние изломы
  'elk.layered.unnecessaryBendpoints': 'true',
  // BRANDES_KOEPF: максимальное выпрямление
  'elk.layered.nodePlacement.bk.edgeStraightening': 'IMPROVE_STRAIGHTNESS',
  'elk.layered.nodePlacement.bk.fixedAlignment': 'BALANCED',
  // Больше воздуха везде — меньше визуальной каши
  'elk.spacing.nodeNode': '70',
  'elk.spacing.edgeNode': '30',
  'elk.spacing.edgeEdge': '24',
  'elk.spacing.componentComponent': '140',
  'elk.layered.spacing.nodeNodeBetweenLayers': '100',
  'elk.layered.spacing.edgeNodeBetweenLayers': '32',
  'elk.layered.spacing.edgeEdgeBetweenLayers': '20',
  // Высокая точность распределения по слоям + компактификация
  'elk.layered.layering.strategy': 'NETWORK_SIMPLEX',
  'elk.layered.compaction.postCompaction.strategy': 'EDGE_LENGTH',
}

// ─── FSD (Feature-Sliced Design) layer ordering ──────────────────────────
// Каноничные слои FSD сверху вниз: app → processes → pages → widgets →
// features → entities → shared. В графе зависимостей это слева направо
// (app тянет shared, не наоборот). Если у ноды `group` сматчился по
// одному из паттернов — её партиция пиннится к этому FSD-тиру, перебивая
// longest-path. Это даёт чистые «вертикальные ленты» по архитектуре, а
// не по случайной цепочке зависимостей.
const FSD_LAYER_PATTERNS: { tier: number; match: RegExp }[] = [
  { tier: 0, match: /^(app|application|main|root|entry|entries|template|templates)(_|$|-)/i },
  { tier: 1, match: /^(processes|process|flows)(_|$|-)/i },
  { tier: 2, match: /^(pages|page|views|screens)(_|$|-)/i },
  { tier: 3, match: /^(widgets|widget|panels)(_|$|-)/i },
  { tier: 4, match: /^(features|feature|fts)(_|$|-)/i },
  { tier: 5, match: /^(entities|entity|models|domain)(_|$|-)/i },
  { tier: 6, match: /^(shared|lib|libs|library|libraries|kit|ui|api|stores|store|misc|utils|util|helpers|plugins|vendor|core)(_|$|-)/i },
]

function fsdTierOf(groupId: string | undefined): number | undefined {
  if (!groupId) return undefined
  for (const { tier, match } of FSD_LAYER_PATTERNS) {
    if (match.test(groupId)) return tier
  }
  return undefined
}

export interface ToFlowOptions {
  /** Run ELK with the high-thoroughness "optimize paths" profile. */
  optimize?: boolean
}

/**
 * Manual FSD-tier layout: бесповоротно строгие колонки по FSD-слоям.
 * X = fsdTier * COL_WIDTH, Y = индекс в стопке тира × ROW_HEIGHT.
 * Не зовём ELK — рёбра отдаются vue-flow для smoothstep-рендеринга.
 * Срабатывает только если в DSL у всех узлов есть FSD-распознаваемая
 * группа; иначе fallback на ELK-layout.
 */
function tryFsdLayout(
  doc: ObstructionDoc,
  collapsedSet: Set<string>,
): FlowGraph | null {
  const junctions = doc.junctions ?? []
  const junctionIds = new Set(junctions.map((j) => j.id))

  // Все ли узлы и junction'ы укладываются в FSD?
  const nodeTier = new Map<string, number>()
  for (const n of doc.nodes) {
    const t = fsdTierOf(n.group)
    if (t === undefined) return null
    nodeTier.set(n.id, t)
  }
  for (const j of junctions) {
    const t = fsdTierOf(j.group)
    if (t === undefined) return null
    nodeTier.set(j.id, t)
  }

  const COL_WIDTH = NODE_WIDTH + 220
  const ROW_GAP = 16

  // Группируем по тиру, сохраняя порядок появления в DSL.
  const byTier = new Map<number, string[]>()
  for (const n of doc.nodes) {
    const t = nodeTier.get(n.id)!
    if (!byTier.has(t)) byTier.set(t, [])
    byTier.get(t)!.push(n.id)
  }
  for (const j of junctions) {
    const t = nodeTier.get(j.id)!
    if (!byTier.has(t)) byTier.set(t, [])
    byTier.get(t)!.push(j.id)
  }

  // Position map: id → {x, y}
  const pos = new Map<string, { x: number; y: number }>()
  for (const [t, ids] of byTier) {
    const x = t * COL_WIDTH
    let y = 0
    for (const id of ids) {
      const isJunction = junctionIds.has(id)
      const node = doc.nodes.find((n) => n.id === id)
      const h = isJunction
        ? JUNCTION_SIZE
        : estimateHeight(node!, collapsedSet.has(id))
      pos.set(id, { x: isJunction ? x + (NODE_WIDTH - JUNCTION_SIZE) / 2 : x, y })
      y += h + ROW_GAP
    }
  }

  const flowNodes: Node[] = []
  for (const n of doc.nodes) {
    const p = pos.get(n.id)!
    flowNodes.push({
      id: n.id,
      type: 'obstruction',
      position: { x: p.x, y: p.y },
      data: n,
      style: { width: `${NODE_WIDTH}px` },
    })
  }
  for (const j of junctions) {
    const p = pos.get(j.id)!
    flowNodes.push({
      id: j.id,
      type: 'junction',
      position: { x: p.x, y: p.y },
      data: j,
      style: { width: `${JUNCTION_SIZE}px`, height: `${JUNCTION_SIZE}px` },
    })
  }

  // Edges — smoothstep, без ELK-bends (data.bends отсутствует → fallback).
  const edges: Edge[] = doc.edges.map((e, i) => {
    const from = parseEndpoint(e.from, junctionIds)
    const to = parseEndpoint(e.to, junctionIds)
    let sourceHandle: string
    let targetHandle: string
    if (from.kind === 'junction') {
      const side = from.rowOrSide && from.rowOrSide !== 'auto' ? from.rowOrSide : 'r'
      sourceHandle = `${side}-source`
    } else {
      sourceHandle = `${from.rowOrSide}-source`
    }
    if (to.kind === 'junction') {
      const side = to.rowOrSide && to.rowOrSide !== 'auto' ? to.rowOrSide : 'l'
      targetHandle = `${side}-target`
    } else {
      targetHandle = `${to.rowOrSide}-target`
    }
    return {
      id: `e${i}-${e.from}->${e.to}`,
      source: from.nodeId,
      sourceHandle,
      target: to.nodeId,
      targetHandle,
      type: 'flow',
      data: {
        color: e.color ?? 'cyan',
        label: e.label,
        shape: e.shape ?? 'smoothstep',
      },
    }
  })

  return { nodes: flowNodes, edges }
}

export async function toFlow(
  doc: ObstructionDoc,
  collapsedSet: Set<string> = new Set(),
  opts: ToFlowOptions = {},
): Promise<FlowGraph> {
  // FSD shortcut: если все узлы укладываются в FSD-слои — кладём вручную
  // строгими колонками, ELK не вызываем. Это даёт максимально предсказуемый
  // и «WoT-tech-tree-style» layout: pages | widgets | features | entities | shared.
  const fsd = tryFsdLayout(doc, collapsedSet)
  if (fsd) return fsd

  const rootOptions = opts.optimize ? OPTIMIZE_OPTIONS : ROOT_OPTIONS
  const groups = doc.groups ?? []
  const junctions = doc.junctions ?? []
  const junctionIds = new Set(junctions.map((j) => j.id))

  // ─── Entry detection ─────────────────────────────────────────────────────
  // A node is an "entry" (root of the dependency tree) if either:
  //   • it has no incoming edges,
  //   • or the user explicitly marked it with `entry: true` in the DSL.
  //
  // Entries get layerConstraint=FIRST so ELK pins them to the leftmost
  // column. Groups containing entries inherit that constraint at root level.
  const incoming = new Map<string, number>()
  for (const e of doc.edges) {
    const [toHead] = e.to.split('.')
    if (!toHead) continue
    incoming.set(toHead, (incoming.get(toHead) ?? 0) + 1)
  }
  const entryIds = new Set<string>()
  for (const n of doc.nodes) {
    const isMarked = n.entry === true
    const noIncoming = !incoming.has(n.id)
    if (isMarked || noIncoming) entryIds.add(n.id)
  }
  // Per-node explicit partition (winning over auto-LP) — три источника:
  //   1. `n.partition` явно задана в DSL,
  //   2. `n.entry: true` → 0,
  //   3. FSD-слой группы узла (app=0, pages=2, widgets=3, …, shared=6).
  // Junctions тоже могут быть в группе → их FSD-тир тоже учитывается.
  const nodePartition = new Map<string, number>()
  for (const n of doc.nodes) {
    if (typeof n.partition === 'number') nodePartition.set(n.id, n.partition)
    else if (n.entry === true) nodePartition.set(n.id, 0)
    else {
      const fsd = fsdTierOf(n.group)
      if (fsd !== undefined) nodePartition.set(n.id, fsd)
    }
  }
  for (const j of junctions) {
    const fsd = fsdTierOf(j.group)
    if (fsd !== undefined) nodePartition.set(j.id, fsd)
  }

  // ─── Longest-path tier computation (WoT tech-tree look) ─────────────────
  // Для каждой ноды/junction считаем самую длинную цепочку от entry-узла.
  // Это число → `elk.partitioning.partition`, и ELK прижимает узел к
  // соответствующей колонке-тиру.
  const outAdj = new Map<string, string[]>()
  for (const e of doc.edges) {
    const [fh] = e.from.split('.')
    const [th] = e.to.split('.')
    if (!fh || !th) continue
    if (!outAdj.has(fh)) outAdj.set(fh, [])
    outAdj.get(fh)!.push(th)
  }
  const tier = new Map<string, number>()
  for (const id of entryIds) tier.set(id, nodePartition.get(id) ?? 0)
  // Junctions без входов — тоже tier 0 (визуальные затычки)
  for (const j of junctions) {
    if (!incoming.has(j.id)) tier.set(j.id, 0)
  }
  // Explicit partitions per node/group выигрывают над auto-LP
  for (const [id, p] of nodePartition) tier.set(id, p)
  // DAG longest-path relaxation: повторяем пока что-то меняется (циклы
  // ограничены счётчиком).
  const allTierableIds = [
    ...doc.nodes.map((n) => n.id),
    ...junctions.map((j) => j.id),
  ]
  const MAX_RELAX = allTierableIds.length + 16
  let changed = true
  let relaxIter = 0
  while (changed && relaxIter++ < MAX_RELAX) {
    changed = false
    for (const [from, tos] of outAdj) {
      const fd = tier.get(from)
      if (fd === undefined) continue
      for (const to of tos) {
        // Если у `to` есть жёсткий explicit partition — не трогаем.
        if (nodePartition.has(to)) continue
        const cur = tier.get(to)
        const nd = fd + 1
        if (cur === undefined || nd > cur) {
          tier.set(to, nd)
          changed = true
        }
      }
    }
  }
  // Изолированные / cycle-only → tier 0
  for (const id of allTierableIds) if (!tier.has(id)) tier.set(id, 0)

  // ─── Build ELK input: всё плоско, без compound-обёрток групп ─────────────
  // Группы остаются метаданными (для цвета/фильтра), но НЕ создают
  // ELK-компаундов — иначе колонки-тиры разваливаются.
  //
  // Чтобы получить СТРОГИЕ tier-колонки (FSD-look), используем два
  // механизма ELK:
  //   1. `elk.layered.layering.layerChoiceConstraint` — per-node hard pin
  //      к конкретному номеру слоя. Это «прибивает» ноду к колонке.
  //   2. `elk.partitioning.partition` — мягкое подтверждение порядка.
  const freeChildren: ElkNode[] = []
  for (const n of doc.nodes) {
    const t = tier.get(n.id) ?? 0
    freeChildren.push({
      id: n.id,
      width: NODE_WIDTH,
      height: estimateHeight(n, collapsedSet.has(n.id)),
      layoutOptions: {
        'elk.layered.layering.layerChoiceConstraint': String(t),
        'elk.partitioning.partition': String(t),
      },
    })
  }
  for (const j of junctions) {
    const t = tier.get(j.id) ?? 0
    freeChildren.push({
      id: j.id,
      width: JUNCTION_SIZE,
      height: JUNCTION_SIZE,
      layoutOptions: {
        'elk.layered.layering.layerChoiceConstraint': String(t),
        'elk.partitioning.partition': String(t),
      },
    })
  }
  // В WoT-режиме компаундов нет — переменная оставлена для совместимости
  // с edge-walk кодом ниже (он ожидает массив).
  const compounds: ElkNode[] = []

  const elkEdges = doc.edges.map((e, i) => {
    const [fromHead] = e.from.split('.')
    const [toHead] = e.to.split('.')
    return {
      id: `e${i}`,
      sources: [fromHead ?? ''],
      targets: [toHead ?? ''],
    }
  })

  let layouted: ElkNode
  try {
    layouted = await elk.layout({
      id: 'root',
      layoutOptions: rootOptions,
      children: [...compounds, ...freeChildren],
      edges: elkEdges,
    })
  } catch (err) {
    console.error('[glyph] ELK layout failed, falling back to grid', err)
    layouted = {
      id: 'root',
      children: [...compounds, ...freeChildren].map((c, i) => ({
        ...c,
        x: (i % 8) * 320,
        y: Math.floor(i / 8) * 280,
      })),
    }
  }

  // ─── Flatten: collect absolute (canvas-space) positions ──────────────────
  const absPos = new Map<
    string,
    { x: number; y: number; w: number; h: number }
  >()

  function walkAbs(node: ElkNode, offsetX: number, offsetY: number) {
    const ax = offsetX + (node.x ?? 0)
    const ay = offsetY + (node.y ?? 0)
    absPos.set(node.id!, {
      x: ax,
      y: ay,
      w: node.width ?? 0,
      h: node.height ?? 0,
    })
    for (const child of node.children ?? []) walkAbs(child, ax, ay)
  }
  for (const c of layouted.children ?? []) walkAbs(c, 0, 0)

  // Safety net: any doc.node / junction that didn't get a position from ELK
  // (network issues, layout edge cases, unexpected hierarchy) gets a default
  // grid slot so it stays visible instead of vanishing.
  // Crucially — place them BELOW the existing ELK layout (not at 0,0) so
  // missing nodes don't visually overlap the rest of the graph.
  const missing = doc.nodes.filter((n) => !absPos.has(n.id))
  if (missing.length > 0) {
    console.warn(
      `[glyph] ${missing.length}/${doc.nodes.length} nodes missing from ELK output — placing on fallback grid`,
    )
    // Find the bottom edge of the ELK-laid-out content
    let maxY = 0
    for (const p of absPos.values()) maxY = Math.max(maxY, p.y + p.h)
    const startY = maxY + 80 // gap between ELK content and fallback grid
    for (let i = 0; i < missing.length; i++) {
      const n = missing[i]!
      absPos.set(n.id, {
        x: (i % 10) * (NODE_WIDTH + 60),
        y: startY + Math.floor(i / 10) * 200,
        w: NODE_WIDTH,
        h: estimateHeight(n, collapsedSet.has(n.id)),
      })
    }
  }
  for (const j of junctions) {
    if (!absPos.has(j.id)) {
      absPos.set(j.id, {
        x: 0,
        y: 0,
        w: JUNCTION_SIZE,
        h: JUNCTION_SIZE,
      })
    }
  }

  // ─── Edge bend points: translate by their container's offset ─────────────
  // ELK puts an edge under the lowest common ancestor of its endpoints.
  // sections[].{startPoint,endPoint,bendPoints} are RELATIVE to that container.
  const edgeBends = new Map<
    string,
    { bends: { x: number; y: number }[]; startX: number; startY: number; endX: number; endY: number }
  >()

  function walkEdges(node: ElkNode) {
    const offset = absPos.get(node.id!) ?? { x: 0, y: 0, w: 0, h: 0 }
    for (const e of node.edges ?? []) {
      const sec = (e as { sections?: ElkEdgeSection[] }).sections?.[0]
      if (!sec) continue
      edgeBends.set(e.id!, {
        startX: sec.startPoint.x + offset.x,
        startY: sec.startPoint.y + offset.y,
        endX: sec.endPoint.x + offset.x,
        endY: sec.endPoint.y + offset.y,
        bends: (sec.bendPoints ?? []).map((p) => ({
          x: p.x + offset.x,
          y: p.y + offset.y,
        })),
      })
    }
    for (const c of node.children ?? []) walkEdges(c)
  }
  // Root's own edges are at offset (0,0) by virtue of absPos for root being undefined.
  // Treat the root specially:
  for (const e of (layouted as { edges?: ElkExtendedEdge[] }).edges ?? []) {
    const sec = e.sections?.[0]
    if (!sec) continue
    edgeBends.set(e.id!, {
      startX: sec.startPoint.x,
      startY: sec.startPoint.y,
      endX: sec.endPoint.x,
      endY: sec.endPoint.y,
      bends: (sec.bendPoints ?? []).map((p) => ({ x: p.x, y: p.y })),
    })
  }
  for (const c of layouted.children ?? []) walkEdges(c)

  // ─── Build vue-flow nodes ────────────────────────────────────────────────
  // WoT-режим: всё плоско, групп-контейнеров в графе нет. Сами группы из
  // doc.groups остаются метаданными (для цвета/фильтра), но в flowNodes
  // не попадают — иначе колонки-тиры разваливаются.
  const flowNodes: Node[] = []

  for (const n of doc.nodes) {
    const pos = absPos.get(n.id)
    if (!pos) continue
    flowNodes.push({
      id: n.id,
      type: 'obstruction',
      position: { x: pos.x, y: pos.y },
      data: n,
      style: { width: `${NODE_WIDTH}px` },
    })
  }

  for (const j of junctions) {
    const pos = absPos.get(j.id)
    if (!pos) continue
    flowNodes.push({
      id: j.id,
      type: 'junction',
      position: { x: pos.x, y: pos.y },
      data: j,
      style: { width: `${JUNCTION_SIZE}px`, height: `${JUNCTION_SIZE}px` },
    })
  }

  // ─── Edges ───────────────────────────────────────────────────────────────
  const edges: Edge[] = doc.edges.map((e, i) => {
    const from = parseEndpoint(e.from, junctionIds)
    const to = parseEndpoint(e.to, junctionIds)

    let sourceHandle: string
    let targetHandle: string
    if (from.kind === 'junction') {
      const side = from.rowOrSide && from.rowOrSide !== 'auto' ? from.rowOrSide : 'r'
      sourceHandle = `${side}-source`
    } else {
      sourceHandle = `${from.rowOrSide}-source`
    }
    if (to.kind === 'junction') {
      const side = to.rowOrSide && to.rowOrSide !== 'auto' ? to.rowOrSide : 'l'
      targetHandle = `${side}-target`
    } else {
      targetHandle = `${to.rowOrSide}-target`
    }

    const bends = edgeBends.get(`e${i}`)
    return {
      id: `e${i}-${e.from}->${e.to}`,
      source: from.nodeId,
      sourceHandle,
      target: to.nodeId,
      targetHandle,
      type: 'flow',
      data: {
        color: e.color ?? 'cyan',
        label: e.label,
        shape: e.shape ?? 'smoothstep',
        bends: bends?.bends,
        elkStart: bends ? { x: bends.startX, y: bends.startY } : undefined,
        elkEnd: bends ? { x: bends.endX, y: bends.endY } : undefined,
      },
    }
  })

  return { nodes: flowNodes, edges }
}

