<script setup lang="ts">
import { computed } from 'vue'
import type { NodeProps } from '@vue-flow/core'
import { NodeResizer } from '@vue-flow/node-resizer'
import '@vue-flow/node-resizer/dist/style.css'
import { Folder, Palette, Pencil } from 'lucide-vue-next'
import type { GroupSpec, AccentColor } from '../dsl/schema'

const props = defineProps<NodeProps<GroupSpec & { headerHeight?: number }>>()

const colorVar: Record<AccentColor, string> = {
  cyan: 'var(--accent-cyan)',
  green: 'var(--accent-green)',
  magenta: 'var(--accent-magenta)',
  orange: 'var(--accent-orange)',
  yellow: 'var(--accent-yellow)',
  gray: 'var(--accent-gray)',
}

const color = computed(() => colorVar[props.data.color ?? 'cyan'])
const title = computed(() => props.data.title ?? 'Node Group')
const headerHeight = computed(() => props.data.headerHeight ?? 32)
</script>

<template>
  <div class="group-node" :style="{ '--gc': color, '--gh': headerHeight + 'px' }">
    <NodeResizer
      :is-visible="props.selected"
      :min-width="180"
      :min-height="120"
      :color="color"
      :handle-style="{
        width: '10px',
        height: '10px',
        borderRadius: '2px',
        background: color,
        border: '2px solid var(--node-bg)',
      }"
      :line-style="{ borderColor: color, borderWidth: '1px' }"
    />
    <div class="group-node__header">
      <Folder :size="13" :stroke-width="2" class="group-node__icon" />
      <span class="group-node__title">{{ title }}</span>
      <span class="group-node__actions">
        <Palette :size="12" :stroke-width="2" />
        <Pencil :size="12" :stroke-width="2" />
      </span>
    </div>
    <div class="group-node__body" />
  </div>
</template>

<style scoped>
.group-node {
  width: 100%;
  height: 100%;
  border-radius: 8px;
  background: rgba(15, 23, 34, 0.35);
  border: 1px dashed var(--gc);
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.02),
    0 0 20px rgba(0, 0, 0, 0.35);
  position: relative;
  /* no overflow:hidden — NodeResizer handles must be allowed to overflow */
}

.group-node__header {
  border-top-left-radius: 8px;
  border-top-right-radius: 8px;
}

.group-node__header {
  display: flex;
  align-items: center;
  gap: 8px;
  height: var(--gh);
  padding: 0 12px;
  background: linear-gradient(180deg, rgba(26, 38, 56, 0.85), rgba(15, 23, 34, 0.7));
  border-bottom: 1px dashed color-mix(in oklab, var(--gc) 60%, transparent);
  color: var(--text-dim);
  cursor: grab;
  user-select: none;
}

.group-node__header:active {
  cursor: grabbing;
}

.group-node__icon {
  color: var(--gc);
  filter: drop-shadow(0 0 4px var(--gc));
}

.group-node__title {
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.01em;
  color: var(--text);
  flex: 1;
}

.group-node__actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--text-faint);
}

.group-node__body {
  flex: 1;
}
</style>
