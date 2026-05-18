import ELK from 'elkjs/lib/elk.bundled.js'
import type { Edge, Node } from '@vue-flow/core'
import type { ObstructionDoc, NodeSpec } from './schema'

const NODE_WIDTH = 240
const ROW_HEIGHT = 44
const HEADER_HEIGHT = 42
const PROGRESS_HEIGHT = 48
const FOOTER_HEIGHT = 48
const JUNCTION_SIZE = 16
const GROUP_PADDING = 24
const GROUP_HEADER = 32

function estimateHeight(node: NodeSpec): number {
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

// Layout options tuned for the dependency-graph case:
//   layered + RIGHT direction  →  source-on-left, sinks-on-right
//   ORTHOGONAL edge routing    →  right-angle wires that ELK steers AROUND
//                                 obstacle nodes (the user's main ask)
//   nodePlacement.strategy     →  BRANDES_KOEPF gives compact "factory" feel
//
// Spacing is generous; smaller values cause edges to bunch.
const ELK_OPTIONS: Record<string, string> = {
  'elk.algorithm': 'layered',
  'elk.direction': 'RIGHT',
  'elk.edgeRouting': 'ORTHOGONAL',
  'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
  'elk.layered.spacing.nodeNodeBetweenLayers': '90',
  'elk.spacing.nodeNode': '40',
  'elk.spacing.edgeNode': '20',
  'elk.spacing.edgeEdge': '12',
  'elk.layered.crossingMinimization.semiInteractive': 'true',
  'elk.padding': '[top=24,left=24,bottom=24,right=24]',
}

export async function toFlow(doc: ObstructionDoc): Promise<FlowGraph> {
  const junctions = doc.junctions ?? []
  const groups = doc.groups ?? []
  const junctionIds = new Set(junctions.map((j) => j.id))

  // ─── Build ELK input ─────────────────────────────────────────────────────
  const heights = new Map<string, number>()
  const elkChildren = [
    ...doc.nodes.map((n) => {
      const h = estimateHeight(n)
      heights.set(n.id, h)
      return { id: n.id, width: NODE_WIDTH, height: h }
    }),
    ...junctions.map((j) => ({
      id: j.id,
      width: JUNCTION_SIZE,
      height: JUNCTION_SIZE,
    })),
  ]

  // ELK collapses parallel edges between the same pair; keep an id-stable list
  // so we can re-attach our handles after layout.
  const elkEdges = doc.edges.map((e, i) => {
    const [fromHead] = e.from.split('.')
    const [toHead] = e.to.split('.')
    return {
      id: `e${i}`,
      sources: [fromHead ?? ''],
      targets: [toHead ?? ''],
    }
  })

  let layouted: Awaited<ReturnType<typeof elk.layout>>
  try {
    layouted = await elk.layout({
      id: 'root',
      layoutOptions: ELK_OPTIONS,
      children: elkChildren,
      edges: elkEdges,
    })
  } catch (err) {
    console.error('[glyph] ELK layout failed, falling back to grid', err)
    layouted = { id: 'root', children: elkChildren.map((c, i) => ({ ...c, x: (i % 10) * 300, y: Math.floor(i / 10) * 200 })) }
  }

  // ─── Position lookup ─────────────────────────────────────────────────────
  const absPositions = new Map<
    string,
    { x: number; y: number; w: number; h: number }
  >()
  for (const child of layouted.children ?? []) {
    absPositions.set(child.id!, {
      x: child.x ?? 0,
      y: child.y ?? 0,
      w: child.width ?? NODE_WIDTH,
      h: child.height ?? 100,
    })
  }

  // Map ELK edge id → bend points (in canvas coords)
  const edgeBends = new Map<
    string,
    { startX: number; startY: number; endX: number; endY: number; bends: { x: number; y: number }[] }
  >()
  for (const e of layouted.edges ?? []) {
    const section = e.sections?.[0]
    if (!section) continue
    edgeBends.set(e.id!, {
      startX: section.startPoint.x,
      startY: section.startPoint.y,
      endX: section.endPoint.x,
      endY: section.endPoint.y,
      bends: (section.bendPoints ?? []).map((p) => ({ x: p.x, y: p.y })),
    })
  }

  // ─── Group bounding boxes (decorative frames, computed AFTER layout) ─────
  const groupBox = new Map<string, { x: number; y: number; w: number; h: number }>()
  const PAD = GROUP_PADDING
  for (const grp of groups) {
    const memberIds: string[] = [
      ...doc.nodes.filter((n) => n.group === grp.id).map((n) => n.id),
      ...junctions.filter((j) => j.group === grp.id).map((j) => j.id),
    ]
    if (memberIds.length === 0) continue
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity
    for (const id of memberIds) {
      const p = absPositions.get(id)
      if (!p) continue
      minX = Math.min(minX, p.x)
      minY = Math.min(minY, p.y)
      maxX = Math.max(maxX, p.x + p.w)
      maxY = Math.max(maxY, p.y + p.h)
    }
    const autoW = maxX - minX + PAD * 2
    const autoH = maxY - minY + PAD * 2 + GROUP_HEADER
    groupBox.set(grp.id, {
      x: grp.x ?? minX - PAD,
      y: grp.y ?? minY - PAD - GROUP_HEADER,
      w: grp.width ?? autoW,
      h: grp.height ?? autoH,
    })
  }

  const flowNodes: Node[] = []

  // groups go first (lowest z-index)
  for (const grp of groups) {
    const box = groupBox.get(grp.id)
    if (!box) continue
    flowNodes.push({
      id: grp.id,
      type: 'group-container',
      position: { x: box.x, y: box.y },
      data: { ...grp, headerHeight: GROUP_HEADER },
      style: { width: `${box.w}px`, height: `${box.h}px`, zIndex: 0 },
      selectable: false,
      draggable: false,
      focusable: false,
    })
  }

  for (const n of doc.nodes) {
    const pos = absPositions.get(n.id)
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
    const pos = absPositions.get(j.id)
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
        // ELK bend points let FlowEdge render an obstacle-avoiding polyline.
        // Coordinates are in vue-flow's canvas frame (same as node x,y).
        bends: bends?.bends,
        elkStart: bends ? { x: bends.startX, y: bends.startY } : undefined,
        elkEnd: bends ? { x: bends.endX, y: bends.endY } : undefined,
      },
    }
  })

  return { nodes: flowNodes, edges }
}
