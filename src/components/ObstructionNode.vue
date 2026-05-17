<script setup lang="ts">
import { computed } from 'vue'
import { Handle, Position, type NodeProps } from '@vue-flow/core'
import type { NodeSpec, AccentColor } from '../dsl/schema'
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
</script>

<template>
  <div class="obs-node">
    <div class="obs-node__header">
      <component :is="iconFor(node.icon)" :size="16" :stroke-width="2" class="obs-node__header-icon" />
      <span class="obs-node__title">{{ node.title }}</span>
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
          <div class="obs-node__row-label">{{ row.label }}</div>
          <div v-if="row.value !== undefined" class="obs-node__row-value">{{ row.value }}</div>
        </div>

        <Handle
          v-if="row.type === 'target' || row.type === 'both'"
          :id="`${row.id}-target`"
          type="target"
          :position="Position.Left"
          class="obs-handle"
          :style="{
            background: colorOf(row.color),
            boxShadow: `0 0 6px ${colorOf(row.color)}`,
          }"
        />
        <Handle
          v-if="row.type === 'source' || row.type === 'both'"
          :id="`${row.id}-source`"
          type="source"
          :position="Position.Right"
          class="obs-handle"
          :style="{
            background: colorOf(row.color),
            boxShadow: `0 0 6px ${colorOf(row.color)}`,
          }"
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
  padding: 6px 14px 6px 12px;
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

/* Vue Flow handles — position to row right edge */
.obs-handle {
  width: 10px !important;
  height: 10px !important;
  border-radius: 50% !important;
  border: 2px solid var(--node-bg) !important;
  z-index: 2;
}

.obs-handle.vue-flow__handle-left {
  left: -5px !important;
}

.obs-handle.vue-flow__handle-right {
  right: -5px !important;
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
