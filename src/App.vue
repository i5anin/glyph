<script setup lang="ts">
import { computed, provide, ref, shallowRef, watch } from 'vue'
import { watchDebounced } from '@vueuse/core'
import type { Connection, Edge, Node } from '@vue-flow/core'
import { ChevronLeft, PanelLeft } from 'lucide-vue-next'
import { parseDsl, DslError } from './dsl/parse'
import { toFlow } from './dsl/toFlow'
import { toDsl, edgeSpecFromConnection, endpointRefFromHandle } from './dsl/fromFlow'
import type { NodeSpec, ObstructionDoc } from './dsl/schema'
import {
  loadGraphs,
  persist,
  createBlankGraph,
  duplicateGraph,
  type SavedGraph,
} from './storage/graphs'
import GraphCanvas from './components/GraphCanvas.vue'
import DslEditor from './components/DslEditor.vue'
import GraphPicker from './components/GraphPicker.vue'
import CardsListView from './components/CardsListView.vue'

// ─── Left-panel display mode (persisted) ─────────────────────────────────
type LeftMode = 'yaml' | 'cards'
const LEFT_MODE_KEY = 'glyph:left-mode'
const leftMode = ref<LeftMode>(
  (localStorage.getItem(LEFT_MODE_KEY) as LeftMode) ?? 'yaml',
)
watch(leftMode, (v) => localStorage.setItem(LEFT_MODE_KEY, v))

// ─── Saved-graphs storage ───────────────────────────────────────────────
const initial = loadGraphs()
const graphs = ref<SavedGraph[]>(initial.graphs)
const currentId = ref<string>(initial.currentId)

function currentGraph(): SavedGraph | undefined {
  return graphs.value.find((g) => g.id === currentId.value)
}

const dslText = ref(currentGraph()?.yaml ?? '')
const error = ref<string | null>(null)
const nodes = shallowRef<Node[]>([])
const edges = shallowRef<Edge[]>([])

// current canonical doc — single source of truth. Updated from either side.
const currentDoc = shallowRef<ObstructionDoc>({ nodes: [], edges: [] })

// ─── Centralized collapse state ──────────────────────────────────────────
// Declared up here (not next to its toggle helpers below) because applyFromDsl
// is invoked synchronously at script-setup time (line ~90) and references this
// ref — keeping the declaration below would hit TDZ.
const collapsedNodes = ref<Set<string>>(new Set())
provide('glyph:collapsedNodes', collapsedNodes)

// ─── Hover highlight state ───────────────────────────────────────────────
// Единый источник правды для подсветки — Set из node-id, которые сейчас
// «активны» (наведены прямо или связаны с наведённым ребром/нодой).
//
// Ставит ObstructionNode (на pointerenter) — set = self + 1-hop neighbours.
// Ставит FlowEdge (на pointerenter) — set = {source, target}.
// Чистится с задержкой (см. createHoverController), чтобы не моргало когда
// курсор кратко проскальзывает между картой и hit-area соседнего ребра.
const highlightedIds = ref<Set<string> | null>(null)
provide('glyph:highlightedIds', highlightedIds)

// Глобальный leave-таймер (ОДИН на всё приложение, а не по инстансу).
// Когда курсор перепрыгивает с одной карточки на другую, leave первой
// карточки запускает таймер на 140ms — НО enter второй карточки этот
// таймер немедленно отменяет и ставит новую подсветку. Без общего таймера
// каждая карточка имела свой счётчик и старый dispose затирал свежую
// подсветку → визуальное мерцание.
let globalLeaveTimer: ReturnType<typeof setTimeout> | null = null

function setHighlight(next: Set<string>) {
  if (globalLeaveTimer) { clearTimeout(globalLeaveTimer); globalLeaveTimer = null }
  highlightedIds.value = next
}
function clearHighlight() {
  if (globalLeaveTimer) clearTimeout(globalLeaveTimer)
  globalLeaveTimer = setTimeout(() => {
    highlightedIds.value = null
    globalLeaveTimer = null
  }, 140)
}
provide('glyph:setHighlight', setHighlight)
provide('glyph:clearHighlight', clearHighlight)

// «Ветви» ноды — транзитивный обход в ОБА направления по рёбрам. Это
// включает: саму ноду, все ноды от которых она зависит (incoming) И все
// ноды, которые зависят от неё (outgoing) — рекурсивно. Хорошо для понимания
// «что сломаю если изменю это».
provide('glyph:neighborsOf', (id: string): Set<string> => {
  const set = new Set<string>([id])
  const queue: string[] = [id]
  // Pre-build adjacency once per traversal — O(E) вместо O(N·E)
  const adj = new Map<string, Set<string>>()
  for (const e of currentDoc.value.edges) {
    const from = e.from.split('.')[0]
    const to = e.to.split('.')[0]
    if (!from || !to) continue
    if (!adj.has(from)) adj.set(from, new Set())
    if (!adj.has(to)) adj.set(to, new Set())
    adj.get(from)!.add(to)
    adj.get(to)!.add(from)
  }
  while (queue.length) {
    const cur = queue.shift()!
    const next = adj.get(cur)
    if (!next) continue
    for (const n of next) {
      if (set.has(n)) continue
      set.add(n)
      queue.push(n)
    }
  }
  return set
})

// ─── Selected node ───────────────────────────────────────────────────────
// Последняя «выбранная» нода (через клик в списке слева или в графе).
// Подсветка стойкая, не сбрасывается на pointerleave. Используется обоими
// представлениями: CardsListView рисует акцентную рамку, ObstructionNode —
// неоновое кольцо.
const selectedNodeId = ref<string | null>(null)
provide('glyph:selectedNodeId', selectedNodeId)
function selectNode(id: string) {
  selectedNodeId.value = id
}
provide('glyph:selectNode', selectNode)

// guard against feedback loops when we programmatically rewrite the textarea
let syncingFromGraph = false

// When this flag is true on the next applyFromDsl run, all nodes are collapsed
// by default after layout. Set on initial load and whenever the user picks a
// different graph — but NOT on YAML edits, since wiping the user's expanded
// state on every keystroke would be obnoxious.
let collapseAllOnNextApply = true

async function applyFromDsl(text: string) {
  if (syncingFromGraph) return
  try {
    const doc = parseDsl(text)
    currentDoc.value = doc
    // Apply the "collapse all" intent BEFORE layout so ELK reserves chip-sized
    // height for these nodes instead of full-card height (avoids huge gaps).
    if (collapseAllOnNextApply) {
      collapsedNodes.value = new Set(doc.nodes.map((n) => n.id))
      collapseAllOnNextApply = false
    }
    const flow = await toFlow(doc, collapsedNodes.value)
    nodes.value = flow.nodes
    edges.value = flow.edges
    error.value = null
  } catch (e) {
    if (e instanceof DslError) error.value = e.message
    else error.value = (e as Error).message
  }
}

async function applyFromDoc(next: ObstructionDoc) {
  currentDoc.value = next
  const flow = await toFlow(next, collapsedNodes.value)
  nodes.value = flow.nodes
  edges.value = flow.edges
  syncingFromGraph = true
  dslText.value = toDsl(next)
  // release the guard on the next tick — watchDebounced will see it after debounce
  setTimeout(() => {
    syncingFromGraph = false
  }, 0)
}

void applyFromDsl(dslText.value)

watchDebounced(dslText, (v) => void applyFromDsl(v), {
  debounce: 300,
  maxWait: 1200,
})

// ─── Persist YAML edits back into the current saved graph ────────────────
watchDebounced(
  dslText,
  (v) => {
    const idx = graphs.value.findIndex((g) => g.id === currentId.value)
    if (idx === -1) return
    if (graphs.value[idx]!.yaml === v) return
    graphs.value[idx]!.yaml = v
    persist(graphs.value, currentId.value)
  },
  { debounce: 600, maxWait: 2400 },
)

watch(error, () => {})

// ─── Graph picker handlers ──────────────────────────────────────────────
// Flush in-flight edits of the current graph synchronously before switching,
// so the persist-debounce can't drop changes onto the wrong target.
function flushCurrentYaml() {
  const idx = graphs.value.findIndex((g) => g.id === currentId.value)
  if (idx !== -1) graphs.value[idx]!.yaml = dslText.value
}

function onPickerSelect(id: string) {
  if (id === currentId.value) return
  flushCurrentYaml()
  currentId.value = id
  persist(graphs.value, id)
  const g = currentGraph()
  if (g) {
    collapseAllOnNextApply = true
    dslText.value = g.yaml // triggers applyFromDsl via watchDebounced
  }
}

function onPickerAdd() {
  flushCurrentYaml()
  const g = createBlankGraph()
  graphs.value = [...graphs.value, g]
  currentId.value = g.id
  persist(graphs.value, g.id)
  collapseAllOnNextApply = true
  dslText.value = g.yaml
}

function onPickerDuplicate(id: string) {
  flushCurrentYaml()
  const src = graphs.value.find((g) => g.id === id)
  if (!src) return
  const copy = duplicateGraph(src)
  graphs.value = [...graphs.value, copy]
  currentId.value = copy.id
  persist(graphs.value, copy.id)
  collapseAllOnNextApply = true
  dslText.value = copy.yaml
}

function onPickerRename(id: string, name: string) {
  const idx = graphs.value.findIndex((g) => g.id === id)
  if (idx === -1) return
  graphs.value[idx] = { ...graphs.value[idx]!, name }
  graphs.value = [...graphs.value]
  persist(graphs.value, currentId.value)
}

// Source of truth for collapsed state is declared higher up (above
// applyFromDsl) to avoid a TDZ hit on the initial synchronous call.
// Each ObstructionNode injects this set + the toggle action below.
// We replace the Set instance on every change so .has() stays reactive.

function computeDownstream(rootId: string): Set<string> {
  const out = new Set<string>([rootId])
  const queue = [rootId]
  while (queue.length) {
    const cur = queue.shift()!
    for (const e of currentDoc.value.edges) {
      const from = e.from.split('.')[0]
      const to = e.to.split('.')[0]
      if (from === cur && to && !out.has(to)) {
        out.add(to)
        queue.push(to)
      }
    }
  }
  return out
}

// Toggle ONLY this node (solo). Cascade is a separate action below.
function toggleNodeSolo(id: string) {
  const next = new Set(collapsedNodes.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  collapsedNodes.value = next
}
provide('glyph:toggleNodeSolo', toggleNodeSolo)

// Toggle this node + the entire downstream subtree (cascade). The action
// depends on the CURRENT state of the clicked root: if it's expanded, we
// collapse the subtree; if it's collapsed, we expand the subtree.
function toggleNodeCascade(id: string) {
  const rootCollapsed = collapsedNodes.value.has(id)
  const reach = computeDownstream(id)
  const next = new Set(collapsedNodes.value)
  if (rootCollapsed) for (const d of reach) next.delete(d)
  else for (const d of reach) next.add(d)
  collapsedNodes.value = next
}
provide('glyph:toggleNodeCascade', toggleNodeCascade)

function collapseAll() {
  collapsedNodes.value = new Set(currentDoc.value.nodes.map((n) => n.id))
}
function expandAll() {
  collapsedNodes.value = new Set()
}

// Card-list click → pan + zoom the graph to that node + persist selection.
const graphCanvas = ref<{ focusNode: (id: string) => void } | null>(null)
function onCardFocus(id: string) {
  selectedNodeId.value = id
  graphCanvas.value?.focusNode(id)
}

// Re-run ELK with the current doc — useful after user drags/collapses make
// the cached layout look stale (long diagonal edges, overlap).
function relayout() {
  void applyFromDoc({ ...currentDoc.value })
}

// «Оптимизировать пути» — прогон ELK с агрессивным crossing-minimization.
// Медленнее обычного relayout (thoroughness:40 vs default 7), но даёт
// заметно меньше пересечений на запутанных графах.
async function optimizePaths() {
  const next = { ...currentDoc.value }
  currentDoc.value = next
  const flow = await toFlow(next, collapsedNodes.value, { optimize: true })
  nodes.value = flow.nodes
  edges.value = flow.edges
  syncingFromGraph = true
  dslText.value = toDsl(next)
  setTimeout(() => { syncingFromGraph = false }, 0)
}

function onPickerRemove(id: string) {
  if (graphs.value.length <= 1) return
  const idx = graphs.value.findIndex((g) => g.id === id)
  if (idx === -1) return
  const wasCurrent = id === currentId.value
  if (!wasCurrent) flushCurrentYaml()
  graphs.value = graphs.value.filter((g) => g.id !== id)
  if (wasCurrent) {
    const next = graphs.value[Math.max(0, idx - 1)] ?? graphs.value[0]!
    currentId.value = next.id
    collapseAllOnNextApply = true
    dslText.value = next.yaml
  }
  persist(graphs.value, currentId.value)
}

// ─── graph-side mutations ───

function onConnect(c: Connection) {
  const e = edgeSpecFromConnection(c)
  if (!e) return
  void applyFromDoc({
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
  void applyFromDoc({ ...currentDoc.value, edges: next })
}

function onEdgeRemove(edgeId: string) {
  const idx = currentDoc.value.edges.findIndex(
    (_, i) => `e${i}-${currentDoc.value.edges[i]!.from}->${currentDoc.value.edges[i]!.to}` === edgeId,
  )
  if (idx === -1) return
  const next = currentDoc.value.edges.filter((_, i) => i !== idx)
  void applyFromDoc({ ...currentDoc.value, edges: next })
}

// Inline-edit on a node: receive a partial patch and merge.
function onNodePatch(nodeId: string, patch: Partial<NodeSpec>) {
  const idx = currentDoc.value.nodes.findIndex((n) => n.id === nodeId)
  if (idx === -1) return
  const next = [...currentDoc.value.nodes]
  next[idx] = { ...next[idx]!, ...patch }
  void applyFromDoc({ ...currentDoc.value, nodes: next })
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
  void applyFromDoc({ ...currentDoc.value, nodes: nextNodes })
}

// Resize / rename / recolor a group frame.
function onGroupPatch(groupId: string, patch: Record<string, unknown>) {
  const groups = currentDoc.value.groups ?? []
  const idx = groups.findIndex((g) => g.id === groupId)
  if (idx === -1) return
  const next = [...groups]
  next[idx] = { ...next[idx]!, ...patch }
  void applyFromDoc({ ...currentDoc.value, groups: next })
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
        <GraphPicker
          :graphs="graphs"
          :current-id="currentId"
          @select="onPickerSelect"
          @add="onPickerAdd"
          @duplicate="onPickerDuplicate"
          @rename="onPickerRename"
          @remove="onPickerRemove"
        />
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
      <div class="app__left">
        <div class="app__left-tabs">
          <button
            class="app__left-tab"
            :class="{ 'app__left-tab--active': leftMode === 'yaml' }"
            type="button"
            @click="leftMode = 'yaml'"
          >YAML</button>
          <button
            class="app__left-tab"
            :class="{ 'app__left-tab--active': leftMode === 'cards' }"
            type="button"
            @click="leftMode = 'cards'"
          >Карточки</button>
          <span class="app__left-tabs-spacer" />
          <span
            v-if="leftMode === 'yaml'"
            class="app__left-status"
            :class="error ? 'app__left-status--err' : 'app__left-status--ok'"
          >● {{ error ? 'error' : 'live' }}</span>
          <button
            class="app__left-collapse"
            type="button"
            title="Скрыть панель"
            @click="toggleDsl"
          >
            <ChevronLeft :size="13" :stroke-width="2.2" />
          </button>
        </div>
        <DslEditor
          v-if="leftMode === 'yaml'"
          v-model="dslText"
          :error="error"
        />
        <CardsListView
          v-else
          :doc="currentDoc"
          @focus-node="onCardFocus"
          @collapse-all="collapseAll"
          @expand-all="expandAll"
        />
      </div>
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
      <GraphCanvas
        ref="graphCanvas"
        :nodes="nodes"
        :edges="edges"
        @connect="onConnect"
        @edge-update="onEdgeUpdate"
        @edge-remove="onEdgeRemove"
        @node-patch="onNodePatch"
        @row-patch="onRowPatch"
        @group-patch="onGroupPatch"
        @collapse-all="collapseAll"
        @expand-all="expandAll"
        @relayout="relayout"
        @optimize="optimizePaths"
      />
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
  align-items: center;
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

/* ── Left panel (tabs + content) ─────────────────────────── */
.app__left {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  background: var(--node-bg);
  border-right: 1px solid var(--node-border);
  overflow: hidden;
}

.app__left-tabs {
  display: flex;
  align-items: stretch;
  height: 34px;
  background: var(--node-header-bg);
  border-bottom: 1px solid var(--node-divider);
  flex-shrink: 0;
  padding-right: 6px;
}

.app__left-tab {
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--text-faint);
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  cursor: pointer;
  padding: 0 14px;
  transition:
    color 0.12s ease,
    border-color 0.12s ease,
    background 0.12s ease;
}

.app__left-tab:hover {
  color: var(--text);
  background: rgba(79, 209, 255, 0.04);
}

.app__left-tab--active {
  color: var(--accent-cyan);
  border-bottom-color: var(--accent-cyan);
  background: rgba(79, 209, 255, 0.06);
}

.app__left-tabs-spacer {
  flex: 1;
}

.app__left-status {
  align-self: center;
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.04em;
  margin-right: 8px;
}

.app__left-status--ok {
  color: var(--accent-green);
  text-shadow: 0 0 6px var(--accent-green);
}

.app__left-status--err {
  color: var(--accent-magenta);
  text-shadow: 0 0 6px var(--accent-magenta);
}

.app__left-collapse {
  align-self: center;
  display: inline-grid;
  place-items: center;
  width: 22px;
  height: 22px;
  background: transparent;
  border: 1px solid var(--node-divider);
  border-radius: 4px;
  color: var(--text-dim);
  cursor: pointer;
  padding: 0;
  transition:
    border-color 0.15s,
    color 0.15s,
    background 0.15s;
}

.app__left-collapse:hover {
  border-color: var(--accent-cyan);
  color: var(--accent-cyan);
  background: rgba(79, 209, 255, 0.08);
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
