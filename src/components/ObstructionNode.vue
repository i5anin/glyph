<script setup lang="ts">
import { computed, inject } from 'vue'
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
  Cloud,
  Database,
  Download,
  File,
  FileText,
  Globe,
  Network,
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

const { edges } = useVueFlow()

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

function onEnterBlur(ev: KeyboardEvent) {
  if (ev.key === 'Enter') {
    ev.preventDefault()
    ;(ev.target as HTMLElement).blur()
  }
  if (ev.key === 'Escape') {
    ev.preventDefault()
    ;(ev.target as HTMLElement).blur()
  }
}
</script>

<template>
  <div class="obs-node">
    <div class="obs-node__header">
      <component :is="iconFor(node.icon)" :size="16" :stroke-width="2" class="obs-node__header-icon" />
      <span
        class="obs-node__title nodrag nopan"
        contenteditable="plaintext-only"
        spellcheck="false"
        :title="'Кликни, чтобы переименовать'"
        @blur="onTitleBlur"
        @keydown="onEnterBlur"
        @mousedown.stop
      >{{ node.title }}</span>
    </div>

    <div v-if="node.rows && node.rows.length" class="obs-node__rows">
      <div
        v-for="row in node.rows"
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
            contenteditable="plaintext-only"
            spellcheck="false"
            @blur="onRowLabelBlur(row.id, $event)"
            @keydown="onEnterBlur"
            @mousedown.stop
          >{{ row.label }}</div>
          <div
            v-if="row.value !== undefined"
            class="obs-node__row-value nodrag nopan"
            contenteditable="plaintext-only"
            spellcheck="false"
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

    <div v-if="node.footer" class="obs-node__footer">
      <span class="obs-node__footer-label">{{ node.footer.label }}</span>
      <span
        v-if="node.footer.price !== undefined"
        class="obs-node__footer-price"
        :style="{ color: colorOf(node.footer.color ?? 'orange') }"
      >
        <DollarSign :size="14" :stroke-width="2.5" />
        {{ node.footer.price }}
      </span>
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
  cursor: text;
}

.obs-node__title:hover {
  background: rgba(79, 209, 255, 0.08);
}

.obs-node__title:focus {
  background: rgba(79, 209, 255, 0.14);
  box-shadow: 0 0 0 1px var(--accent-cyan);
  overflow: visible;
  text-overflow: clip;
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
  cursor: text;
}

.obs-node__row-label:hover,
.obs-node__row-value:hover {
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
