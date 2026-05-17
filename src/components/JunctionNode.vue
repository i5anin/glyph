<script setup lang="ts">
import { computed } from 'vue'
import { Handle, Position, type NodeProps } from '@vue-flow/core'
import type { JunctionSpec, AccentColor } from '../dsl/schema'

const props = defineProps<NodeProps<JunctionSpec>>()

const colorVar: Record<AccentColor, string> = {
  cyan: 'var(--accent-cyan)',
  green: 'var(--accent-green)',
  magenta: 'var(--accent-magenta)',
  orange: 'var(--accent-orange)',
  yellow: 'var(--accent-yellow)',
  gray: 'var(--accent-gray)',
}

const color = computed(() => colorVar[props.data.color ?? 'cyan'])

const sides = [
  { key: 'l', pos: Position.Left },
  { key: 'r', pos: Position.Right },
  { key: 't', pos: Position.Top },
  { key: 'b', pos: Position.Bottom },
] as const
</script>

<template>
  <div class="junction" :style="{ '--jc': color }">
    <Handle
      v-for="s in sides"
      :key="`${s.key}-target`"
      :id="`${s.key}-target`"
      type="target"
      :position="s.pos"
      class="junction-handle"
    />
    <Handle
      v-for="s in sides"
      :key="`${s.key}-source`"
      :id="`${s.key}-source`"
      type="source"
      :position="s.pos"
      class="junction-handle"
    />
    <span class="junction__dot" />
  </div>
</template>

<style scoped>
.junction {
  width: 16px;
  height: 16px;
  position: relative;
  display: grid;
  place-items: center;
}

.junction__dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--jc);
  box-shadow:
    0 0 0 2px rgba(15, 23, 34, 1),
    0 0 10px var(--jc),
    0 0 18px var(--jc);
}

.junction-handle {
  width: 1px !important;
  height: 1px !important;
  min-width: 1px !important;
  min-height: 1px !important;
  background: transparent !important;
  border: none !important;
  opacity: 0;
}

.junction-handle.vue-flow__handle-left {
  left: 0 !important;
}
.junction-handle.vue-flow__handle-right {
  right: 0 !important;
}
.junction-handle.vue-flow__handle-top {
  top: 0 !important;
}
.junction-handle.vue-flow__handle-bottom {
  bottom: 0 !important;
}
</style>
