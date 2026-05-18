<script setup lang="ts">
import { computed, inject, nextTick, onBeforeUnmount, ref, watch, type Ref } from 'vue'
import { Handle, Position, useVueFlow, type NodeProps } from '@vue-flow/core'
import type { NodeSpec, AccentColor } from '../dsl/schema'

type NodePatchFn = (id: string, patch: Record<string, unknown>) => void
type RowPatchFn = (
  nodeId: string,
  rowId: string,
  patch: { label?: string; value?: string },
) => void

const nodePatch = inject<NodePatchFn>('glyph:nodePatch', () => {})
const rowPatch = inject<RowPatchFn>('glyph:rowPatch', () => {})
import {
  AppWindow,
  Box,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronsDown,
  ChevronsRight,
  Cloud,
  Database,
  Download,
  File,
  FileText,
  Globe,
  Network,
  Pencil,
  Route,
  Server,
  Trash2,
  Upload,
  Zap,
  DollarSign,
  TriangleAlert,
  CircleDot,
  type LucideIcon,
} from 'lucide-vue-next'

const props = defineProps<NodeProps<NodeSpec>>()

const node = computed(() => props.data)

const { edges, updateNodeInternals } = useVueFlow()

// ─── Collapse state (centralized in App.vue) ─────────────────────────────
// Reads from a shared Set<id>. Two separate actions:
//   solo    → toggle just this node
//   cascade → toggle this node + every downstream dependency
const collapsedSet = inject<Ref<Set<string>>>('glyph:collapsedNodes')
const toggleNodeSolo = inject<(id: string) => void>('glyph:toggleNodeSolo')
const toggleNodeCascade = inject<(id: string) => void>(
  'glyph:toggleNodeCascade',
)

const collapsed = computed(() => collapsedSet?.value.has(props.id) ?? false)

function onSoloClick() {
  toggleNodeSolo?.(props.id)
}
function onCascadeClick() {
  toggleNodeCascade?.(props.id)
}

// Whenever this node's collapsed state flips (either from local toggle or
// because someone called "collapse all" / cascaded into us), tell vue-flow
// to re-measure dimensions and re-route the edges.
watch(collapsed, () => {
  nextTick(() => updateNodeInternals(props.id))
})

const visibleRows = computed(() => {
  const rows = node.value.rows ?? []
  if (!collapsed.value) return rows
  return rows.filter((r) => r.id === 'in' || r.id === 'deps')
})

const hiddenRowCount = computed(() => {
  const total = node.value.rows?.length ?? 0
  return Math.max(0, total - visibleRows.value.length)
})

const connectedHandleIds = computed(() => {
  const set = new Set<string>()
  for (const e of edges.value) {
    if (e.source === props.id && e.sourceHandle) set.add(`${e.sourceHandle}`)
    if (e.target === props.id && e.targetHandle) set.add(`${e.targetHandle}`)
  }
  return set
})

function isHandleConnected(rowId: string, kind: 'source' | 'target'): boolean {
  return connectedHandleIds.value.has(`${rowId}-${kind}`)
}

const iconMap: Record<string, LucideIcon> = {
  'app-window': AppWindow,
  box: Box,
  cloud: Cloud,
  database: Database,
  download: Download,
  file: File,
  'file-text': FileText,
  globe: Globe,
  network: Network,
  route: Route,
  server: Server,
  trash: Trash2,
  upload: Upload,
  zap: Zap,
  money: DollarSign,
  warn: TriangleAlert,
}

function iconFor(name: string | undefined): LucideIcon {
  if (!name) return CircleDot
  return iconMap[name] ?? CircleDot
}

const colorVar: Record<AccentColor, string> = {
  cyan: 'var(--accent-cyan)',
  green: 'var(--accent-green)',
  magenta: 'var(--accent-magenta)',
  orange: 'var(--accent-orange)',
  yellow: 'var(--accent-yellow)',
  gray: 'var(--accent-gray)',
}

function colorOf(c: AccentColor | undefined): string {
  return colorVar[c ?? 'cyan']
}

function progressPercent(current: number, max: number): number {
  if (max <= 0) return 0
  return Math.max(0, Math.min(100, (current / max) * 100))
}

function onTitleBlur(ev: FocusEvent) {
  const next = (ev.target as HTMLElement).textContent?.trim() ?? ''
  if (next && next !== node.value.title) {
    nodePatch(props.id, { title: next })
  }
}

function onRowLabelBlur(rowId: string, ev: FocusEvent) {
  const next = (ev.target as HTMLElement).textContent?.trim() ?? ''
  const row = node.value.rows?.find((r) => r.id === rowId)
  if (row && next && next !== row.label) {
    rowPatch(props.id, rowId, { label: next })
  }
}

function onRowValueBlur(rowId: string, ev: FocusEvent) {
  const next = (ev.target as HTMLElement).textContent?.trim() ?? ''
  const row = node.value.rows?.find((r) => r.id === rowId)
  if (row && next !== String(row.value ?? '')) {
    rowPatch(props.id, rowId, { value: next })
  }
}

// ─── Edit mode (per-card toggle) ───────────────────────────────────────────
// Click the pencil that appears on hover → all text in this card becomes
// editable. Click the check (or anywhere outside the card, or press Esc) → exit.
const editing = ref(false)
const rootEl = ref<HTMLDivElement | null>(null)

function onDocPointerDown(ev: PointerEvent) {
  if (!editing.value) return
  const root = rootEl.value
  if (root && ev.target instanceof Node && !root.contains(ev.target)) {
    editing.value = false
    document.removeEventListener('pointerdown', onDocPointerDown, true)
  }
}

function onEnterBlur(ev: KeyboardEvent) {
  if (ev.key === 'Enter') {
    ev.preventDefault()
    ;(ev.target as HTMLElement).blur()
  }
  if (ev.key === 'Escape') {
    ev.preventDefault()
    ;(ev.target as HTMLElement).blur()
    if (editing.value) {
      editing.value = false
      document.removeEventListener('pointerdown', onDocPointerDown, true)
    }
  }
}

function onEditToggle() {
  editing.value = !editing.value
  if (editing.value) {
    nextTick(() => {
      // focus the title so the user can start typing immediately
      const t = rootEl.value?.querySelector<HTMLElement>('.obs-node__title')
      t?.focus()
      // place caret at end
      const sel = window.getSelection()
      if (t && sel) {
        const range = document.createRange()
        range.selectNodeContents(t)
        range.collapse(false)
        sel.removeAllRanges()
        sel.addRange(range)
      }
      document.addEventListener('pointerdown', onDocPointerDown, true)
    })
  } else {
    document.removeEventListener('pointerdown', onDocPointerDown, true)
  }
}

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocPointerDown, true)
})
</script>

<template>
  <div
    ref="rootEl"
    class="obs-node"
    :class="{ 'obs-node--editing': editing, 'obs-node--collapsed': collapsed }"
  >
    <div class="obs-node__header">
      <button
        class="obs-node__collapse-btn nodrag nopan"
        type="button"
        :title="collapsed ? `Развернуть карточку (${hiddenRowCount} строк скрыто)` : 'Свернуть только эту карточку'"
        @pointerdown.stop
        @click.stop="onSoloClick"
      >
        <component :is="collapsed ? ChevronRight : ChevronDown" :size="13" :stroke-width="2.2" />
      </button>
      <component :is="iconFor(node.icon)" :size="16" :stroke-width="2" class="obs-node__header-icon" />
      <span
        class="obs-node__title nodrag nopan"
        :contenteditable="editing ? 'plaintext-only' : 'false'"
        spellcheck="false"
        :title="editing ? 'Enter — сохранить, Esc — выйти из правки' : node.title"
        @blur="onTitleBlur"
        @keydown="onEnterBlur"
        @mousedown.stop
      >{{ node.title }}</span>
      <span v-if="collapsed && hiddenRowCount > 0" class="obs-node__collapsed-badge">
        +{{ hiddenRowCount }}
      </span>
      <button
        class="obs-node__cascade-btn nodrag nopan"
        type="button"
        :title="collapsed ? 'Развернуть всю ветку (карточку + всё, что она тянет)' : 'Свернуть всю ветку (карточку + все её зависимости)'"
        @pointerdown.stop
        @click.stop="onCascadeClick"
      >
        <component :is="collapsed ? ChevronsRight : ChevronsDown" :size="13" :stroke-width="2.2" />
      </button>
      <button
        class="obs-node__edit-btn nodrag nopan"
        type="button"
        :title="editing ? 'Готово' : 'Редактировать текст'"
        @pointerdown.stop
        @click.stop="onEditToggle"
      >
        <component :is="editing ? Check : Pencil" :size="13" :stroke-width="2" />
      </button>
    </div>

    <div v-if="visibleRows.length" class="obs-node__rows">
      <div
        v-for="row in visibleRows"
        :key="row.id"
        class="obs-node__row"
      >
        <component
          :is="iconFor(row.icon)"
          :size="18"
          :stroke-width="1.8"
          class="obs-node__row-icon"
          :style="{ color: colorOf(row.color) }"
        />
        <div class="obs-node__row-text">
          <div
            class="obs-node__row-label nodrag nopan"
            :contenteditable="editing ? 'plaintext-only' : 'false'"
            spellcheck="false"
            :title="row.label"
            @blur="onRowLabelBlur(row.id, $event)"
            @keydown="onEnterBlur"
            @mousedown.stop
          >{{ row.label }}</div>
          <div
            v-if="row.value !== undefined"
            class="obs-node__row-value nodrag nopan"
            :contenteditable="editing ? 'plaintext-only' : 'false'"
            spellcheck="false"
            :title="String(row.value)"
            @blur="onRowValueBlur(row.id, $event)"
            @keydown="onEnterBlur"
            @mousedown.stop
          >{{ row.value }}</div>
        </div>

        <Handle
          v-if="row.type === 'target' || row.type === 'both'"
          :id="`${row.id}-target`"
          type="target"
          :position="Position.Left"
          class="obs-handle"
          :class="isHandleConnected(row.id, 'target') ? 'obs-handle--on' : 'obs-handle--off'"
          :title="
            isHandleConnected(row.id, 'target')
              ? 'Потяни и брось в пустоту, чтобы отсоединить'
              : 'Потяни отсюда, чтобы создать связь'
          "
          :style="{ '--hc': colorOf(row.color) }"
        />

        <Handle
          v-if="row.type === 'source' || row.type === 'both'"
          :id="`${row.id}-source`"
          type="source"
          :position="Position.Right"
          class="obs-handle"
          :class="isHandleConnected(row.id, 'source') ? 'obs-handle--on' : 'obs-handle--off'"
          :title="
            isHandleConnected(row.id, 'source')
              ? 'Потяни и брось в пустоту, чтобы отсоединить'
              : 'Потяни отсюда, чтобы создать связь'
          "
          :style="{ '--hc': colorOf(row.color) }"
        />

        <span
          v-if="!row.type || row.type === 'none'"
          class="obs-node__dot"
          :style="{ background: colorOf(row.color) }"
        ></span>
      </div>
    </div>

    <div v-if="node.progress" class="obs-node__progress">
      <div class="obs-node__progress-bar">
        <div
          class="obs-node__progress-fill"
          :style="{
            width: progressPercent(node.progress.current, node.progress.max) + '%',
            background: colorOf(node.progress.color ?? 'green'),
          }"
        ></div>
      </div>
      <div class="obs-node__progress-meta">
        <span class="obs-node__progress-current">{{ node.progress.current }}</span>
        <span class="obs-node__progress-max">{{ node.progress.max }}</span>
      </div>
    </div>

  </div>
</template>

<style scoped>
.obs-node {
  width: var(--node-w);
  background: var(--node-bg);
  border: 1px solid var(--node-border);
  border-radius: var(--radius);
  overflow: hidden;
  font-family: var(--font-ui);
  color: var(--text);
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.02) inset,
    0 8px 28px rgba(0, 0, 0, 0.45);
  position: relative;
}

.obs-node__header {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 38px;
  padding: 0 12px;
  background: var(--node-header-bg);
  border-bottom: 1px solid var(--node-divider);
}

.obs-node__header-icon {
  color: var(--text-dim);
  flex-shrink: 0;
}

.obs-node__title {
  font-size: 13px;
  font-weight: 500;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  outline: none;
  border-radius: 3px;
  padding: 1px 4px;
  margin: -1px -4px;
  cursor: default;
}

.obs-node--editing .obs-node__title {
  cursor: text;
}

.obs-node--editing .obs-node__title:hover {
  background: rgba(79, 209, 255, 0.08);
}

.obs-node__title:focus {
  background: rgba(79, 209, 255, 0.14);
  box-shadow: 0 0 0 1px var(--accent-cyan);
  overflow: visible;
  text-overflow: clip;
}

/* ── Collapse chevrons (always visible, on the left of header) ─── */
.obs-node__collapse-btn,
.obs-node__cascade-btn {
  display: inline-grid;
  place-items: center;
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 3px;
  color: var(--text-faint);
  cursor: pointer;
  padding: 0;
  transition:
    color 0.12s ease,
    border-color 0.12s ease,
    background 0.12s ease;
}

.obs-node__collapse-btn:hover {
  color: var(--accent-cyan);
  border-color: var(--accent-cyan);
  background: rgba(79, 209, 255, 0.08);
}

/* Cascade chevron — appears on hover on the RIGHT side of the header so the
   solo chevron and the title get more room. Orange so its action is visually
   distinct from the solo (cyan) chevron and the pencil (cyan) edit button. */
.obs-node__cascade-btn {
  opacity: 0;
  transform: translateY(-1px);
  color: var(--text-faint);
  transition:
    opacity 0.12s ease,
    color 0.12s ease,
    border-color 0.12s ease,
    background 0.12s ease;
}

.obs-node:hover .obs-node__cascade-btn {
  opacity: 1;
}

.obs-node__cascade-btn:hover {
  color: var(--accent-orange);
  border-color: var(--accent-orange);
  background: rgba(255, 159, 64, 0.1);
}

.obs-node__collapsed-badge {
  display: inline-block;
  padding: 1px 5px;
  margin-right: 2px;
  background: rgba(79, 209, 255, 0.10);
  color: var(--accent-cyan);
  border: 1px solid color-mix(in oklab, var(--accent-cyan) 40%, transparent);
  border-radius: 8px;
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.02em;
  user-select: none;
  flex-shrink: 0;
}

/* ── Mini / collapsed presentation ──────────────────────────
   Goal: turn a tall node into a chip so big graphs read at a glance.
   Function rows are already dropped from DOM by `visibleRows`.
   Here we additionally squeeze the header and the in/deps strip. */
.obs-node--collapsed {
  opacity: 0.96;
}

.obs-node--collapsed .obs-node__header {
  height: 30px;
  padding: 0 8px;
  gap: 6px;
}

.obs-node--collapsed .obs-node__header-icon {
  width: 13px;
  height: 13px;
}

.obs-node--collapsed .obs-node__title {
  font-size: 12px;
}

.obs-node--collapsed .obs-node__row {
  min-height: 20px;
  padding: 2px 24px;
  grid-template-columns: 14px 1fr auto;
  gap: 4px;
}

.obs-node--collapsed .obs-node__row-icon {
  width: 12px;
  height: 12px;
}

.obs-node--collapsed .obs-node__row-label {
  /* "imported by" / "uses" — too verbose when miniaturized */
  display: none;
}

.obs-node--collapsed .obs-node__row-value {
  font-size: 11px;
  font-weight: 600;
}

.obs-node--collapsed .obs-handle {
  width: 10px !important;
  height: 10px !important;
}

/* ── Edit button (pencil → check) ──────────────────────── */
.obs-node__edit-btn {
  display: inline-grid;
  place-items: center;
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 4px;
  color: var(--text-faint);
  cursor: pointer;
  padding: 0;
  opacity: 0;
  transform: translateY(-1px);
  transition:
    opacity 0.12s ease,
    color 0.12s ease,
    border-color 0.12s ease,
    background 0.12s ease;
}

.obs-node:hover .obs-node__edit-btn,
.obs-node--editing .obs-node__edit-btn {
  opacity: 1;
}

.obs-node__edit-btn:hover {
  color: var(--accent-cyan);
  border-color: var(--accent-cyan);
  background: rgba(79, 209, 255, 0.08);
}

.obs-node--editing .obs-node__edit-btn {
  color: var(--accent-green);
  border-color: color-mix(in oklab, var(--accent-green) 50%, transparent);
  background: rgba(80, 220, 130, 0.08);
}

.obs-node__rows {
  display: flex;
  flex-direction: column;
}

.obs-node__row {
  position: relative;
  display: grid;
  grid-template-columns: 28px 1fr auto;
  align-items: center;
  gap: 8px;
  min-height: var(--row-h);
  /* extra side padding leaves breathing room around the handles inside the node */
  padding: 6px 28px 6px 28px;
  border-bottom: 1px solid var(--node-divider);
}

.obs-node__row:last-child {
  border-bottom: none;
}

.obs-node__row-icon {
  flex-shrink: 0;
}

.obs-node__row-text {
  display: flex;
  flex-direction: column;
  gap: 1px;
  text-align: right;
  min-width: 0;
}

.obs-node__row-label,
.obs-node__row-value {
  outline: none;
  border-radius: 3px;
  padding: 1px 4px;
  margin: -1px -4px;
  cursor: default;
}

.obs-node--editing .obs-node__row-label,
.obs-node--editing .obs-node__row-value {
  cursor: text;
}

.obs-node--editing .obs-node__row-label:hover,
.obs-node--editing .obs-node__row-value:hover {
  background: rgba(79, 209, 255, 0.08);
}

.obs-node__row-label:focus,
.obs-node__row-value:focus {
  background: rgba(79, 209, 255, 0.14);
  box-shadow: 0 0 0 1px var(--accent-cyan);
  overflow: visible;
  text-overflow: clip;
}

.obs-node__row-label {
  font-size: 12px;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.obs-node__row-value {
  font-size: 11px;
  color: var(--text-dim);
  font-family: var(--font-mono);
  white-space: nowrap;
}

.obs-node__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-left: 4px;
}

/* ─── Handles ─────────────────────────────────────────── */
.obs-handle {
  width: 12px !important;
  height: 12px !important;
  border-radius: 50% !important;
  z-index: 3;
  background: transparent !important;
  border: none !important;
  transition: transform 0.12s ease;
}

/* Handles live INSIDE the node — wires plug into the row content,
   mirroring Upload Labs where the connector dot sits next to the label. */
.obs-handle.vue-flow__handle-left {
  left: 8px !important;
}
.obs-handle.vue-flow__handle-right {
  right: 8px !important;
}

/* connected: filled + glow */
.obs-handle--on {
  background: var(--hc) !important;
  box-shadow:
    0 0 0 2px var(--node-bg),
    0 0 8px var(--hc),
    0 0 14px var(--hc);
}

/* free: hollow ring, no glow */
.obs-handle--off {
  background: var(--node-bg) !important;
  box-shadow:
    inset 0 0 0 2px var(--hc),
    0 0 0 2px var(--node-bg);
  opacity: 0.7;
}

.obs-handle--off:hover {
  opacity: 1;
  transform: scale(1.25);
  box-shadow:
    inset 0 0 0 2px var(--hc),
    0 0 0 2px var(--node-bg),
    0 0 10px var(--hc);
}

.obs-handle--on:hover {
  transform: scale(1.15);
}

/* connected handle = grab handle for the wire's endpoint */
.obs-handle {
  cursor: grab;
}
.obs-handle:active {
  cursor: grabbing;
}

.obs-node__progress {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-top: 1px solid var(--node-divider);
  background: var(--node-bg);
}

.obs-node__progress-bar {
  position: relative;
  flex: 1;
  height: 6px;
  background: var(--node-header-bg);
  border-radius: 3px;
  overflow: hidden;
}

.obs-node__progress-fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.3s ease;
  box-shadow: 0 0 6px currentColor;
}

.obs-node__progress-meta {
  display: flex;
  align-items: baseline;
  gap: 4px;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-dim);
}

.obs-node__progress-current {
  color: var(--text-value);
}

.obs-node__footer {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  height: 36px;
  padding: 0 14px;
  background: var(--node-bg-elev);
  border-top: 1px solid var(--node-divider);
  cursor: pointer;
  transition: background 0.15s ease;
}

.obs-node__footer:hover {
  background: var(--node-row-hover);
}

.obs-node__footer-label {
  font-size: 12px;
  color: var(--text-dim);
}

.obs-node__footer-price {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 600;
}
</style>
