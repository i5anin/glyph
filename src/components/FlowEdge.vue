<script setup lang="ts">
import { computed } from 'vue'
import {
  BaseEdge,
  getBezierPath,
  getSmoothStepPath,
  getStraightPath,
  type EdgeProps,
  Position,
} from '@vue-flow/core'

type EdgeShape = 'smoothstep' | 'step' | 'bezier' | 'straight'

interface EdgeData {
  color?: 'cyan' | 'green' | 'magenta' | 'orange' | 'yellow' | 'gray'
  label?: string
  shape?: EdgeShape
}

const props = defineProps<EdgeProps<EdgeData>>()

const path = computed(() => {
  const shape: EdgeShape = props.data?.shape ?? 'smoothstep'
  const common = {
    sourceX: props.sourceX,
    sourceY: props.sourceY,
    sourcePosition: props.sourcePosition ?? Position.Right,
    targetX: props.targetX,
    targetY: props.targetY,
    targetPosition: props.targetPosition ?? Position.Left,
  }
  switch (shape) {
    case 'bezier':
      return getBezierPath({ ...common, curvature: 0.35 })
    case 'step':
      return getSmoothStepPath({ ...common, borderRadius: 0 })
    case 'straight':
      return getStraightPath(common)
    case 'smoothstep':
    default:
      return getSmoothStepPath({ ...common, borderRadius: 10 })
  }
})

const color = computed(() => {
  const c = props.data?.color ?? 'cyan'
  const map = {
    cyan: 'var(--accent-cyan)',
    green: 'var(--accent-green)',
    magenta: 'var(--accent-magenta)',
    orange: 'var(--accent-orange)',
    yellow: 'var(--accent-yellow)',
    gray: 'var(--accent-gray)',
  } as const
  return map[c] ?? map.cyan
})
</script>

<template>
  <BaseEdge :id="id" :path="path[0]" :style="{ stroke: 'transparent' }" />
  <path
    class="flow-edge__halo"
    :d="path[0]"
    :stroke="color"
    fill="none"
    stroke-width="6"
    stroke-linecap="round"
    opacity="0.18"
  />
  <path
    class="flow-edge__line"
    :d="path[0]"
    :stroke="color"
    fill="none"
    stroke-width="2"
    stroke-linecap="round"
  />
  <path
    class="flow-edge__flow"
    :d="path[0]"
    :stroke="color"
    fill="none"
    stroke-width="2"
    stroke-linecap="round"
    stroke-dasharray="6 10"
  />
</template>

<style>
.flow-edge__halo {
  filter: blur(2px);
}

.flow-edge__line {
  filter: drop-shadow(0 0 3px currentColor);
}

.flow-edge__flow {
  filter: drop-shadow(0 0 4px currentColor);
  animation: flow-stream 0.9s linear infinite;
}

@keyframes flow-stream {
  to {
    stroke-dashoffset: -16;
  }
}
</style>
