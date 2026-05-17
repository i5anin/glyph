<script setup lang="ts">
import { computed, markRaw, onMounted, onUnmounted, provide, ref, watch } from 'vue'
import {
  VueFlow,
  useVueFlow,
  type Connection,
  type Edge,
  type Node,
} from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import ObstructionNode from './ObstructionNode.vue'
import FlowEdge from './FlowEdge.vue'
import JunctionNode from './JunctionNode.vue'
import GroupNode from './GroupNode.vue'

type Tool = 'cursor' | 'move' | 'select' | 'waypoint'

const props = defineProps<{
  nodes: Node[]
  edges: Edge[]
  tool?: Tool
}>()

const emit = defineEmits<{
  connect: [c: Connection]
  'edge-update': [oldEdgeId: string, newConnection: Connection]
  'edge-remove': [edgeId: string]
  'node-patch': [nodeId: string, patch: Record<string, unknown>]
  'row-patch': [nodeId: string, rowId: string, patch: { label?: string; value?: string }]
  'edge-waypoint': [payload: { edgeId: string; flowX: number; flowY: number }]
}>()

// Per-tool Vue Flow behaviour
const flowMode = computed(() => {
  const t = props.tool ?? 'cursor'
  switch (t) {
    case 'move':
      return { nodesDraggable: false, panOnDrag: true, selectionOnDrag: false, edgesUpdatable: false }
    case 'select':
      return { nodesDraggable: false, panOnDrag: false, selectionOnDrag: true, edgesUpdatable: false }
    case 'waypoint':
      return { nodesDraggable: false, panOnDrag: true, selectionOnDrag: false, edgesUpdatable: false }
    case 'cursor':
    default:
      return { nodesDraggable: true, panOnDrag: true, selectionOnDrag: false, edgesUpdatable: true }
  }
})

// Provide patch callbacks so descendant custom nodes can emit inline edits
// without having to bubble events through Vue Flow internals.
provide('glyph:nodePatch', (id: string, patch: Record<string, unknown>) => {
  emit('node-patch', id, patch)
})
provide('glyph:rowPatch', (nodeId: string, rowId: string, patch: { label?: string; value?: string }) => {
  emit('row-patch', nodeId, rowId, patch)
})

const nodeTypes = markRaw({
  obstruction: ObstructionNode,
  junction: JunctionNode,
  'group-container': GroupNode,
})

const edgeTypes = markRaw({
  flow: FlowEdge,
})

const nodes = computed(() => props.nodes)
const edges = computed(() => props.edges)

const {
  onNodesInitialized,
  onConnect,
  onEdgeUpdate,
  onEdgeUpdateStart,
  onEdgeUpdateEnd,
  onEdgesChange,
  onEdgeClick,
  fitView,
  updateNodeInternals,
  project,
  nodes: vfNodes,
} = useVueFlow()

const rootEl = ref<HTMLDivElement | null>(null)

function refreshAll() {
  const arr = vfNodes.value
  if (!arr || !arr.length) return
  arr.forEach((n) => updateNodeInternals(n.id))
}

function runFit() {
  requestAnimationFrame(() =>
    fitView({ padding: 0.1, duration: 250, minZoom: 0.4, maxZoom: 1.1 }),
  )
}

onNodesInitialized(runFit)

// When the node set changes (e.g. DSL edit) — give Vue Flow a moment, then fit.
watch(
  () => props.nodes.map((n) => n.id).join('|'),
  () => {
    setTimeout(() => {
      refreshAll()
      runFit()
    }, 80)
  },
)

// Vue Flow can mount before the canvas has a real size (we're inside a grid
// track that's 1fr — first paint may be 0px wide). Force-measure on mount,
// then re-measure on every container resize.
let ro: ResizeObserver | null = null
let lastW = 0
let lastH = 0
function kickWhenReady(retries = 12) {
  setTimeout(() => {
    const arr = vfNodes.value
    if (!arr || !arr.length) {
      if (retries > 0) kickWhenReady(retries - 1)
      return
    }
    refreshAll()
    runFit()
    // confirm measurement landed; if any node still has 0×0, retry once more
    const firstZero = arr.some((n) => !n.dimensions || !n.dimensions.width)
    if (firstZero && retries > 0) {
      kickWhenReady(retries - 1)
    }
  }, 100)
}

onMounted(() => {
  kickWhenReady()
  if (rootEl.value && 'ResizeObserver' in window) {
    ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect
      if (!r) return
      // only react to meaningful changes
      if (Math.abs(r.width - lastW) < 2 && Math.abs(r.height - lastH) < 2) return
      lastW = r.width
      lastH = r.height
      refreshAll()
      runFit()
    })
    ro.observe(rootEl.value)
  }
})

onUnmounted(() => {
  ro?.disconnect()
  ro = null
})

onConnect((c) => {
  emit('connect', c)
})

// Drag-endpoint-to-empty-space pattern: assume the update is unsuccessful at
// the start, mark it successful on a valid onEdgeUpdate, and on update-end
// remove the edge if it was never re-anchored to a handle.
let edgeUpdateOk = true

onEdgeUpdateStart(() => {
  edgeUpdateOk = false
})

onEdgeUpdate((e: { edge: Edge; connection: Connection }) => {
  edgeUpdateOk = true
  emit('edge-update', e.edge.id, e.connection)
})

onEdgeUpdateEnd((e: { edge: Edge }) => {
  if (!edgeUpdateOk) {
    emit('edge-remove', e.edge.id)
  }
  edgeUpdateOk = true
})

onEdgesChange((changes) => {
  for (const ch of changes) {
    if (ch.type === 'remove') {
      emit('edge-remove', ch.id)
    }
  }
})

// In waypoint mode, clicking an edge inserts a junction at the click point.
onEdgeClick(({ edge, event }) => {
  if (props.tool !== 'waypoint') return
  const me = event as MouseEvent
  let flowX = 0
  let flowY = 0
  if (typeof project === 'function') {
    const p = project({ x: me.clientX, y: me.clientY })
    flowX = p.x
    flowY = p.y
  }
  emit('edge-waypoint', { edgeId: edge.id, flowX, flowY })
})
</script>

<template>
  <div ref="rootEl" class="graph-canvas">
    <VueFlow
      :nodes="nodes"
      :edges="edges"
      :node-types="nodeTypes"
      :edge-types="edgeTypes"
      :min-zoom="0.3"
      :max-zoom="2"
      :default-viewport="{ x: 0, y: 0, zoom: 0.8 }"
      :nodes-draggable="flowMode.nodesDraggable"
      :nodes-connectable="true"
      :edges-updatable="flowMode.edgesUpdatable"
      :pan-on-drag="flowMode.panOnDrag"
      :selection-on-drag="flowMode.selectionOnDrag"
      :delete-key-code="['Delete', 'Backspace']"
      :elements-selectable="true"
      :select-nodes-on-drag="false"
      :multi-selection-key-code="['Shift']"
      :class="`graph-canvas--tool-${props.tool ?? 'cursor'}`"
    >
      <Background
        pattern-color="var(--bg-grid)"
        :gap="24"
        :size="1"
        variant="dots"
      />
      <Controls position="bottom-right" />
    </VueFlow>
  </div>
</template>

<style scoped>
.graph-canvas {
  width: 100%;
  height: 100%;
  background: var(--bg);
}

/* Cursor hints per tool */
.graph-canvas :deep(.vue-flow.graph-canvas--tool-move .vue-flow__pane) {
  cursor: grab;
}
.graph-canvas :deep(.vue-flow.graph-canvas--tool-move.dragging .vue-flow__pane) {
  cursor: grabbing;
}
.graph-canvas :deep(.vue-flow.graph-canvas--tool-select .vue-flow__pane) {
  cursor: crosshair;
}
.graph-canvas :deep(.vue-flow.graph-canvas--tool-waypoint .vue-flow__edge-path) {
  cursor: copy;
}
.graph-canvas :deep(.vue-flow.graph-canvas--tool-waypoint .vue-flow__edge) {
  cursor: copy;
}
</style>
