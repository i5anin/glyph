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
const GROUP_PADDING = 24
const GROUP_HEADER = 32

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
// LAYOUT STRATEGY (rewritten for dense graphs like soft.pfforum: 90 / 250+).
//
// The old INCLUDE_CHILDREN strategy tried to layer *everything globally* in a
// single pass. With 250 edges crossing group boundaries that collapses into
// a hairball — what you saw on the pfforum screenshot.
//
// New plan:
//   • ROOT lays out groups + ungrouped nodes as black-box rectangles using
//     `layered` LR. Cross-group edges go through whitespace between groups,
//     not through their interiors.
//   • Each GROUP runs its own `layered` LR pass internally. The compound's
//     bounding box is opaque to the root pass.
//   • SEPARATE_CHILDREN is the default when hierarchyHandling is unset, so
//     we just don't set it.
//
// thoroughness is dialed back to 10 (from 100). On 90 nodes the 100-level
// search runs 2-3s per relayout. 10 is the sweet spot: still much better
// crossings than the default 7, runs in <500ms.
// ─────────────────────────────────────────────────────────────────────────────

const ROOT_OPTIONS: Record<string, string> = {
  'elk.algorithm': 'layered',
  'elk.direction': 'RIGHT',
  'elk.edgeRouting': 'ORTHOGONAL',

  // ONE global layered LR pass through groups + their children. Crosses
  // group boundaries cleanly, gives the WoT tech-tree look: entries at
  // layer 0, each descendant pushed right by its longest path from root.
  'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
  'elk.partitioning.activate': 'true',

  // Tree-style layering: every node sits at its longest distance from root
  'elk.layered.layering.strategy': 'LONGEST_PATH',
  'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
  'elk.layered.nodePlacement.bk.fixedAlignment': 'BALANCED',
  'elk.layered.nodePlacement.bk.edgeStraightening': 'IMPROVE_STRAIGHTNESS',

  // Crossing reduction
  'elk.layered.thoroughness': '15',
  'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
  'elk.layered.crossingMinimization.greedySwitch.type': 'TWO_SIDED',
  'elk.layered.cycleBreaking.strategy': 'GREEDY',
  'elk.layered.unnecessaryBendpoints': 'true',

  // Generous spacing — tier columns clearly separated
  'elk.layered.spacing.nodeNodeBetweenLayers': '140',
  'elk.spacing.nodeNode': '40',
  'elk.spacing.edgeNode': '24',
  'elk.spacing.edgeEdge': '14',
  'elk.layered.spacing.edgeNodeBetweenLayers': '32',
  'elk.layered.spacing.edgeEdgeBetweenLayers': '18',

  // Disconnected subgraphs side-by-side
  'elk.separateConnectedComponents': 'true',
  'elk.spacing.componentComponent': '120',
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

const GROUP_PADDING_OPT = `[top=${GROUP_PADDING + GROUP_HEADER},left=${GROUP_PADDING},bottom=${GROUP_PADDING},right=${GROUP_PADDING}]`

// Compound (group) layout — явно прописываем алгоритм, направление и routing,
// чтобы ELK не использовал дефолты для контейнеров (которые могут отличаться
// от root и приводить к перекрытию). Spacing внутри плотнее, чем между
// группами наверху.
// Inside a compound group: layered LR, tier columns, denser than root
// (groups should feel like a self-contained subgraph, not waste of space).
const COMPOUND_OPTIONS: Record<string, string> = {
  'elk.algorithm': 'layered',
  'elk.direction': 'RIGHT',
  'elk.edgeRouting': 'ORTHOGONAL',
  'elk.padding': GROUP_PADDING_OPT,

  'elk.layered.layering.strategy': 'NETWORK_SIMPLEX',
  'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
  'elk.layered.nodePlacement.bk.fixedAlignment': 'BALANCED',
  'elk.layered.nodePlacement.bk.edgeStraightening': 'IMPROVE_STRAIGHTNESS',

  'elk.layered.thoroughness': '10',
  'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
  'elk.layered.crossingMinimization.greedySwitch.type': 'TWO_SIDED',
  'elk.layered.unnecessaryBendpoints': 'true',

  'elk.layered.spacing.nodeNodeBetweenLayers': '70',
  'elk.spacing.nodeNode': '24',
  'elk.spacing.edgeNode': '18',
  'elk.spacing.edgeEdge': '12',
}

// «Оптимизация» внутри компаунда — те же агрессивные опции, но spacing
// внутри плотнее, чем на root-уровне (иначе группы раздуваются непомерно).
const COMPOUND_OPTIMIZE_OPTIONS: Record<string, string> = {
  ...COMPOUND_OPTIONS,
  'elk.layered.thoroughness': '100',
  'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
  'elk.layered.crossingMinimization.greedySwitch.type': 'TWO_SIDED',
  'elk.layered.unnecessaryBendpoints': 'true',
  'elk.layered.nodePlacement.bk.edgeStraightening': 'IMPROVE_STRAIGHTNESS',
  'elk.layered.nodePlacement.bk.fixedAlignment': 'BALANCED',
  'elk.spacing.edgeEdge': '14',
  'elk.spacing.edgeNode': '20',
  'elk.layered.spacing.nodeNodeBetweenLayers': '60',
  'elk.layered.spacing.edgeNodeBetweenLayers': '22',
}

export interface ToFlowOptions {
  /** Run ELK with the high-thoroughness "optimize paths" profile. */
  optimize?: boolean
}

export async function toFlow(
  doc: ObstructionDoc,
  collapsedSet: Set<string> = new Set(),
  opts: ToFlowOptions = {},
): Promise<FlowGraph> {
  const rootOptions = opts.optimize ? OPTIMIZE_OPTIONS : ROOT_OPTIONS
  const groups = doc.groups ?? []
  const junctions = doc.junctions ?? []
  const junctionIds = new Set(junctions.map((j) => j.id))
  const groupIds = new Set(groups.map((g) => g.id))

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
  // A group is an "entry group" iff:
  //   • it has entry=true / partition=0 in its own DSL spec, OR
  //   • it contains at least one entry node.
  const entryGroupIds = new Set<string>()
  for (const g of groups) {
    if (g.entry === true || g.partition === 0) entryGroupIds.add(g.id)
  }
  for (const n of doc.nodes) {
    if (entryIds.has(n.id) && n.group && groupIds.has(n.group)) {
      entryGroupIds.add(n.group)
    }
  }
  // Per-node explicit partition wins over auto-detected entry.
  const nodePartition = new Map<string, number>()
  for (const n of doc.nodes) {
    if (typeof n.partition === 'number') nodePartition.set(n.id, n.partition)
    else if (n.entry === true) nodePartition.set(n.id, 0)
  }
  // Per-group explicit partition.
  const groupPartition = new Map<string, number>()
  for (const g of groups) {
    if (typeof g.partition === 'number') groupPartition.set(g.id, g.partition)
    else if (g.entry === true) groupPartition.set(g.id, 0)
  }

  // ─── Build ELK hierarchy ─────────────────────────────────────────────────
  // Each group becomes a compound node "__group__<id>"; its members
  // (doc.nodes + junctions with that group) live inside as children.
  // Ungrouped nodes go directly under the root.

  const compoundChildren = new Map<string, ElkNode[]>()
  for (const g of groups) compoundChildren.set(g.id, [])
  const freeChildren: ElkNode[] = []

  for (const n of doc.nodes) {
    const child: ElkNode = {
      id: n.id,
      width: NODE_WIDTH,
      height: estimateHeight(n, collapsedSet.has(n.id)),
    }
    // Pin entry nodes to the first layer of whatever container they end up in.
    const layoutOpts: Record<string, string> = {}
    const explicitPartition = nodePartition.get(n.id)
    if (explicitPartition !== undefined) {
      layoutOpts['elk.partitioning.partition'] = String(explicitPartition)
      if (explicitPartition === 0) {
        layoutOpts['elk.layered.layerConstraint'] = 'FIRST'
      }
    } else if (entryIds.has(n.id)) {
      layoutOpts['elk.layered.layerConstraint'] = 'FIRST'
    }
    if (Object.keys(layoutOpts).length > 0) child.layoutOptions = layoutOpts
    if (n.group && groupIds.has(n.group)) {
      compoundChildren.get(n.group)!.push(child)
    } else {
      freeChildren.push(child)
    }
  }
  for (const j of junctions) {
    const child: ElkNode = {
      id: j.id,
      width: JUNCTION_SIZE,
      height: JUNCTION_SIZE,
    }
    if (j.group && groupIds.has(j.group)) {
      compoundChildren.get(j.group)!.push(child)
    } else {
      freeChildren.push(child)
    }
  }

  const compounds: ElkNode[] = []
  const compoundIdOf = (gid: string) => `__group__${gid}`
  const compoundOpts = opts.optimize ? COMPOUND_OPTIMIZE_OPTIONS : COMPOUND_OPTIONS
  for (const g of groups) {
    const children = compoundChildren.get(g.id) ?? []
    if (children.length === 0) continue
    // Жёстко через partitioning (а не через layerConstraint, который ELK
    // может игнорировать на cross-group зависимостях).
    //   • explicit partition выигрывает,
    //   • entry/partition:0 flag → 0,
    //   • эвристика (есть entry-узлы внутри) → 0.
    const explicitPartition = groupPartition.get(g.id)
    const partition =
      explicitPartition !== undefined
        ? explicitPartition
        : entryGroupIds.has(g.id)
          ? 0
          : undefined

    const compoundLayoutOptions: Record<string, string> = { ...compoundOpts }
    if (partition !== undefined) {
      compoundLayoutOptions['elk.partitioning.partition'] = String(partition)
      if (partition === 0) {
        compoundLayoutOptions['elk.layered.layerConstraint'] = 'FIRST'
      }
    }
    compounds.push({
      id: compoundIdOf(g.id),
      layoutOptions: compoundLayoutOptions,
      children,
    })
  }

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
  const flowNodes: Node[] = []

  // groupId → finally-rendered position on canvas (user-x/y override wins
  // over ELK's compound origin). Used below to convert a child's absolute
  // ELK coordinate into a position RELATIVE to its parent group — which is
  // what vue-flow's parentNode feature expects.
  const groupFinalPos = new Map<string, { x: number; y: number }>()

  // groups first (lowest z-index) — sized by ELK's compound dimensions.
  // The header (.group-node__header) is the drag handle; dragging it via
  // vue-flow's native handling moves the group AND every child whose
  // parentNode is this group.
  for (const g of groups) {
    const cp = absPos.get(compoundIdOf(g.id))
    if (!cp) continue
    // Positions/sizes are owned by ELK on every layout pass — user x/y/width/
    // height overrides intentionally ignored. Pinning groups by hand fought
    // the auto-layout (produced overlap + chaotic edge routing on dense
    // graphs), so we drop them. The fields stay in the schema for now to
    // avoid breaking existing YAML files but have no effect.
    const x = cp.x
    const y = cp.y
    const w = cp.w
    const h = cp.h
    groupFinalPos.set(g.id, { x, y })
    flowNodes.push({
      id: g.id,
      type: 'group-container',
      position: { x, y },
      data: { ...g, headerHeight: GROUP_HEADER },
      style: { width: `${w}px`, height: `${h}px`, zIndex: 0 },
      selectable: false,
      // draggable:false — иначе vue-flow ставит inline pointer-events:auto
      // на wrapper, и канвас перестаёт паниться, когда курсор над телом
      // группы. Свой drag реализован прямо в GroupNode.vue через pointer-
      // events на header + updateNode (см. onHeaderPointerDown там).
      draggable: false,
      focusable: false,
    })
  }

  // Helper: convert an absolute ELK position to vue-flow's expected form.
  // If the node belongs to a group → make position relative to the group's
  // ELK origin (NOT user origin — vue-flow handles that internally because
  // we set parentNode); also attach parentNode so dragging the group moves
  // children with it.
  function withParent(
    id: string,
    absX: number,
    absY: number,
    groupId: string | undefined,
  ): { position: { x: number; y: number }; parentNode?: string } {
    if (!groupId || !groupIds.has(groupId)) {
      return { position: { x: absX, y: absY } }
    }
    const cp = absPos.get(compoundIdOf(groupId))
    if (!cp) return { position: { x: absX, y: absY } }
    return {
      position: { x: absX - cp.x, y: absY - cp.y },
      parentNode: groupId,
    }
  }

  for (const n of doc.nodes) {
    const pos = absPos.get(n.id)
    if (!pos) continue
    const wp = withParent(n.id, pos.x, pos.y, n.group)
    flowNodes.push({
      id: n.id,
      type: 'obstruction',
      position: wp.position,
      parentNode: wp.parentNode,
      data: n,
      style: { width: `${NODE_WIDTH}px` },
    })
  }

  for (const j of junctions) {
    const pos = absPos.get(j.id)
    if (!pos) continue
    const wp = withParent(j.id, pos.x, pos.y, j.group)
    flowNodes.push({
      id: j.id,
      type: 'junction',
      position: wp.position,
      parentNode: wp.parentNode,
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

