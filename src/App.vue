<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue'
import { watchDebounced } from '@vueuse/core'
import type { Connection, Edge, Node } from '@vue-flow/core'
import { PanelLeft } from 'lucide-vue-next'
import { parseDsl, DslError } from './dsl/parse'
import { toFlow } from './dsl/toFlow'
import { toDsl, edgeSpecFromConnection, endpointRefFromHandle } from './dsl/fromFlow'
import type { JunctionSpec, NodeSpec, ObstructionDoc } from './dsl/schema'
import { vueAppDemo } from './demo/vueAppDemo'
import GraphCanvas from './components/GraphCanvas.vue'
import DslEditor from './components/DslEditor.vue'
import Toolbar, { type Tool } from './components/Toolbar.vue'

const dslText = ref(vueAppDemo)
const error = ref<string | null>(null)
const nodes = shallowRef<Node[]>([])
const edges = shallowRef<Edge[]>([])

// current canonical doc — single source of truth. Updated from either side.
const currentDoc = shallowRef<ObstructionDoc>({ nodes: [], edges: [] })

// guard against feedback loops when we programmatically rewrite the textarea
let syncingFromGraph = false

function applyFromDsl(text: string) {
  if (syncingFromGraph) return
  try {
    const doc = parseDsl(text)
    currentDoc.value = doc
    const flow = toFlow(doc)
    nodes.value = flow.nodes
    edges.value = flow.edges
    error.value = null
  } catch (e) {
    if (e instanceof DslError) error.value = e.message
    else error.value = (e as Error).message
  }
}

function applyFromDoc(next: ObstructionDoc) {
  currentDoc.value = next
  const flow = toFlow(next)
  nodes.value = flow.nodes
  edges.value = flow.edges
  syncingFromGraph = true
  dslText.value = toDsl(next)
  // release the guard on the next tick — watchDebounced will see it after debounce
  setTimeout(() => {
    syncingFromGraph = false
  }, 0)
}

applyFromDsl(dslText.value)

watchDebounced(dslText, (v) => applyFromDsl(v), { debounce: 300, maxWait: 1200 })

watch(error, () => {})

// ─── graph-side mutations ───

function onConnect(c: Connection) {
  const e = edgeSpecFromConnection(c)
  if (!e) return
  applyFromDoc({
    ...currentDoc.value,
    edges: [...currentDoc.value.edges, e],
  })
}

function onEdgeUpdate(oldEdgeId: string, conn: Connection) {
  if (!conn.source || !conn.target) return
  const idx = currentDoc.value.edges.findIndex(
    (_, i) => `e${i}-${currentDoc.value.edges[i]!.from}->${currentDoc.value.edges[i]!.to}` === oldEdgeId,
  )
  if (idx === -1) return
  const old = currentDoc.value.edges[idx]!
  const next = [...currentDoc.value.edges]
  next[idx] = {
    ...old,
    from: endpointRefFromHandle(conn.source, conn.sourceHandle),
    to: endpointRefFromHandle(conn.target, conn.targetHandle),
  }
  applyFromDoc({ ...currentDoc.value, edges: next })
}

function onEdgeRemove(edgeId: string) {
  const idx = currentDoc.value.edges.findIndex(
    (_, i) => `e${i}-${currentDoc.value.edges[i]!.from}->${currentDoc.value.edges[i]!.to}` === edgeId,
  )
  if (idx === -1) return
  const next = currentDoc.value.edges.filter((_, i) => i !== idx)
  applyFromDoc({ ...currentDoc.value, edges: next })
}

// Inline-edit on a node: receive a partial patch and merge.
function onNodePatch(nodeId: string, patch: Partial<NodeSpec>) {
  const idx = currentDoc.value.nodes.findIndex((n) => n.id === nodeId)
  if (idx === -1) return
  const next = [...currentDoc.value.nodes]
  next[idx] = { ...next[idx]!, ...patch }
  applyFromDoc({ ...currentDoc.value, nodes: next })
}

// Edit a single row inside a node.
function onRowPatch(
  nodeId: string,
  rowId: string,
  patch: { label?: string; value?: string },
) {
  const idx = currentDoc.value.nodes.findIndex((n) => n.id === nodeId)
  if (idx === -1) return
  const n = currentDoc.value.nodes[idx]!
  const rows = (n.rows ?? []).map((r) => (r.id === rowId ? { ...r, ...patch } : r))
  const nextNodes = [...currentDoc.value.nodes]
  nextNodes[idx] = { ...n, rows }
  applyFromDoc({ ...currentDoc.value, nodes: nextNodes })
}

// ─── Toolbar mode ───────────────────────────────────────
const tool = ref<Tool>('cursor')

// When user clicks an edge in waypoint mode — split the edge by inserting a
// junction at the click point, and route both halves through it. The DSL
// updates so the new structure is durable.
function onEdgeWaypointClick(payload: { edgeId: string; flowX: number; flowY: number }) {
  const idx = currentDoc.value.edges.findIndex(
    (_, i) =>
      `e${i}-${currentDoc.value.edges[i]!.from}->${currentDoc.value.edges[i]!.to}` === payload.edgeId,
  )
  if (idx === -1) return
  const old = currentDoc.value.edges[idx]!

  // generate a unique junction id
  const existingIds = new Set([
    ...currentDoc.value.nodes.map((n) => n.id),
    ...(currentDoc.value.junctions ?? []).map((j) => j.id),
  ])
  let n = (currentDoc.value.junctions ?? []).length + 1
  let jid = `J${n}`
  while (existingIds.has(jid)) {
    n += 1
    jid = `J${n}`
  }

  const newJunction: JunctionSpec = { id: jid, color: old.color }
  const nextEdges = [...currentDoc.value.edges]
  // edge from = source → junction(left); edge to = junction(right) → target
  nextEdges.splice(
    idx,
    1,
    { ...old, to: `${jid}.l` },
    { from: `${jid}.r`, to: old.to, color: old.color, shape: old.shape },
  )

  applyFromDoc({
    ...currentDoc.value,
    junctions: [...(currentDoc.value.junctions ?? []), newJunction],
    edges: nextEdges,
  })
}

// ─── DSL panel width (draggable) ─────────────────────────
const DSL_MIN = 220
const DSL_MAX_FRACTION = 0.7
const dslWidth = ref(420) // px
const dslWidthBeforeCollapse = ref(420)
const dslCollapsed = computed(() => dslWidth.value < 12)

function toggleDsl() {
  if (dslCollapsed.value) {
    dslWidth.value = Math.max(DSL_MIN, dslWidthBeforeCollapse.value || 420)
  } else {
    dslWidthBeforeCollapse.value = dslWidth.value
    dslWidth.value = 0
  }
}

let dragging = false
function onSplitterPointerDown(ev: PointerEvent) {
  if (ev.button !== 0) return
  dragging = true
  ;(ev.target as HTMLElement).setPointerCapture(ev.pointerId)
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
}
function onSplitterPointerMove(ev: PointerEvent) {
  if (!dragging) return
  const max = window.innerWidth * DSL_MAX_FRACTION
  const next = Math.max(0, Math.min(max, ev.clientX))
  // snap-close below half of the minimum
  dslWidth.value = next < DSL_MIN / 2 ? 0 : Math.max(DSL_MIN, next)
}
function onSplitterPointerUp(ev: PointerEvent) {
  if (!dragging) return
  dragging = false
  ;(ev.target as HTMLElement).releasePointerCapture?.(ev.pointerId)
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
  if (dslWidth.value > 0) dslWidthBeforeCollapse.value = dslWidth.value
}
</script>

<template>
  <div class="app">
    <header class="app__top">
      <div class="app__brand">
        <button
          v-if="dslCollapsed"
          class="app__toggle-dsl"
          type="button"
          title="Показать YAML"
          @click="toggleDsl"
        >
          <PanelLeft :size="14" :stroke-width="2.2" />
        </button>
        <span class="app__brand-mark">◆</span>
        <span class="app__brand-name">Glyph</span>
        <span class="app__brand-sub">architecture as glyphs · prototype</span>
      </div>
      <div class="app__hint">
        <span class="kbd">YAML</span> слева ↔
        <span class="dot dot--cyan"></span><span class="dot dot--green"></span> граф справа
        — правки в обе стороны
      </div>
    </header>

    <main
      class="app__main"
      :style="{ gridTemplateColumns: `${dslWidth}px 6px 1fr` }"
    >
      <DslEditor v-model="dslText" :error="error" @collapse="toggleDsl" />
      <div
        class="app__splitter"
        :class="{ 'app__splitter--collapsed': dslCollapsed }"
        @pointerdown="onSplitterPointerDown"
        @pointermove="onSplitterPointerMove"
        @pointerup="onSplitterPointerUp"
        @pointercancel="onSplitterPointerUp"
        @dblclick="toggleDsl"
        title="Тяни, чтобы изменить ширину · двойной клик — свернуть/раскрыть"
      ></div>
      <div class="app__canvas-wrap">
        <GraphCanvas
          :nodes="nodes"
          :edges="edges"
          :tool="tool"
          @connect="onConnect"
          @edge-update="onEdgeUpdate"
          @edge-remove="onEdgeRemove"
          @node-patch="onNodePatch"
          @row-patch="onRowPatch"
          @edge-waypoint="onEdgeWaypointClick"
        />
        <Toolbar v-model="tool" />
      </div>
    </main>
  </div>
</template>

<style scoped>
.app {
  display: grid;
  grid-template-rows: 44px 1fr;
  height: 100vh;
  width: 100vw;
  background: var(--bg);
}

.app__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 18px;
  background: var(--node-header-bg);
  border-bottom: 1px solid var(--node-border);
}

.app__brand {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.app__brand-mark {
  color: var(--accent-cyan);
  font-size: 14px;
  text-shadow: 0 0 10px var(--accent-cyan);
}

.app__brand-name {
  font-weight: 600;
  letter-spacing: 0.04em;
  font-size: 13px;
  color: var(--text);
}

.app__brand-sub {
  font-size: 11px;
  color: var(--text-faint);
  font-family: var(--font-mono);
}

.app__hint {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--text-dim);
  font-family: var(--font-mono);
}

.kbd {
  display: inline-block;
  padding: 1px 6px;
  background: var(--node-bg);
  border: 1px solid var(--node-border);
  border-radius: 4px;
  font-size: 10px;
  color: var(--text-value);
}

.dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin: 0 1px;
}
.dot--cyan {
  background: var(--accent-cyan);
  box-shadow: 0 0 6px var(--accent-cyan);
}
.dot--green {
  background: var(--accent-green);
  box-shadow: 0 0 6px var(--accent-green);
}

.app__main {
  display: grid;
  /* columns set inline via :style — dsl | splitter | graph */
  min-height: 0;
}

.app__canvas-wrap {
  position: relative;
  min-width: 0;
  min-height: 0;
}

.app__splitter {
  position: relative;
  background: var(--node-border);
  cursor: col-resize;
  transition: background 0.15s ease;
  touch-action: none;
}

.app__splitter::after {
  content: '';
  position: absolute;
  inset: 0 -3px;
  /* widen the hit-zone without expanding visual width */
}

.app__splitter:hover,
.app__splitter:active {
  background: var(--accent-cyan);
  box-shadow: 0 0 8px var(--accent-cyan);
}

.app__splitter--collapsed {
  background: var(--node-divider);
}
.app__splitter--collapsed:hover {
  background: var(--accent-cyan);
}

.app__toggle-dsl {
  display: inline-grid;
  place-items: center;
  width: 24px;
  height: 24px;
  background: transparent;
  border: 1px solid var(--node-divider);
  border-radius: 4px;
  color: var(--text-dim);
  cursor: pointer;
  padding: 0;
  margin-right: 4px;
  transition:
    border-color 0.15s,
    color 0.15s,
    background 0.15s;
}

.app__toggle-dsl:hover {
  border-color: var(--accent-cyan);
  color: var(--accent-cyan);
  background: rgba(79, 209, 255, 0.08);
}
</style>
