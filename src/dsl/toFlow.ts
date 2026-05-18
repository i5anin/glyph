import dagre from '@dagrejs/dagre'
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

function pickJunctionHandles(
  fromSide: string,
  toSide: string,
): { sourceHandle: string; targetHandle: string } {
  return {
    sourceHandle: `${fromSide}-source`,
    targetHandle: `${toSide}-target`,
  }
}

export function toFlow(doc: ObstructionDoc): FlowGraph {
  const junctions = doc.junctions ?? []
  const groups = doc.groups ?? []
  const junctionIds = new Set(junctions.map((j) => j.id))

  const g = new dagre.graphlib.Graph()
  g.setGraph({ rankdir: 'LR', nodesep: 70, ranksep: 120, marginx: 30, marginy: 30 })
  g.setDefaultEdgeLabel(() => ({}))

  const heights = new Map<string, number>()
  for (const n of doc.nodes) {
    const h = estimateHeight(n)
    heights.set(n.id, h)
    g.setNode(n.id, { width: NODE_WIDTH, height: h })
  }
  for (const j of junctions) {
    g.setNode(j.id, { width: JUNCTION_SIZE, height: JUNCTION_SIZE })
  }
  for (const e of doc.edges) {
    const [fromHead] = e.from.split('.')
    const [toHead] = e.to.split('.')
    if (fromHead && toHead) g.setEdge(fromHead, toHead)
  }

  dagre.layout(g)

  const absPositions = new Map<string, { x: number; y: number; w: number; h: number }>()
  for (const n of doc.nodes) {
    const pos = g.node(n.id)
    const h = heights.get(n.id) ?? 100
    absPositions.set(n.id, {
      x: pos.x - NODE_WIDTH / 2,
      y: pos.y - h / 2,
      w: NODE_WIDTH,
      h,
    })
  }
  for (const j of junctions) {
    const pos = g.node(j.id)
    absPositions.set(j.id, {
      x: pos.x - JUNCTION_SIZE / 2,
      y: pos.y - JUNCTION_SIZE / 2,
      w: JUNCTION_SIZE,
      h: JUNCTION_SIZE,
    })
  }

  // group bounding boxes
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
    // user-controlled override wins over the computed bounding box
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

  // group nodes go first (lower z-index)
  for (const grp of groups) {
    const box = groupBox.get(grp.id)
    if (!box) continue
    flowNodes.push({
      id: grp.id,
      type: 'group-container',
      position: { x: box.x, y: box.y },
      data: { ...grp, headerHeight: GROUP_HEADER },
      style: { width: `${box.w}px`, height: `${box.h}px`, zIndex: 0 },
      // group itself can't be dragged or selected through its body — the inner
      // GroupNode component sets pointer-events:none on the body, and only
      // exposes the header and the SE resize handle as interactive surfaces.
      selectable: false,
      draggable: false,
      focusable: false,
    })
  }

  // Children keep absolute canvas positions and are NOT parented to groups.
  // Groups are pure visual frames — decoupling them from vue-flow's parent/child
  // model means children can be dragged freely, and the group never traps pan
  // events on its surface.
  for (const n of doc.nodes) {
    const pos = absPositions.get(n.id)!
    flowNodes.push({
      id: n.id,
      type: 'obstruction',
      position: { x: pos.x, y: pos.y },
      data: n,
      style: { width: `${NODE_WIDTH}px` },
    })
  }

  for (const j of junctions) {
    const pos = absPositions.get(j.id)!
    flowNodes.push({
      id: j.id,
      type: 'junction',
      position: { x: pos.x, y: pos.y },
      data: j,
      style: { width: `${JUNCTION_SIZE}px`, height: `${JUNCTION_SIZE}px` },
    })
  }

  const edges: Edge[] = doc.edges.map((e, i) => {
    const from = parseEndpoint(e.from, junctionIds)
    const to = parseEndpoint(e.to, junctionIds)

    let sourceHandle: string
    let targetHandle: string

    if (from.kind === 'junction') {
      // side codes: l/r/t/b (left/right/top/bottom). default = r
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
      data: { color: e.color ?? 'cyan', label: e.label, shape: e.shape ?? 'smoothstep' },
    }
  })

  return { nodes: flowNodes, edges }
}

// utility no longer needed at module scope
void pickJunctionHandles
