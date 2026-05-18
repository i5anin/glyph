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
  // ELK-routed waypoints (canvas coords). If present, we build an orthogonal
  // polyline that avoids node bodies. Falls back to smoothstep otherwise.
  bends?: { x: number; y: number }[]
  elkStart?: { x: number; y: number }
  elkEnd?: { x: number; y: number }
}

const props = defineProps<EdgeProps<EdgeData>>()

const path = computed(() => {
  const bends = props.data?.bends
  if (bends && bends.length > 0) {
    // Polyline path: connect handle position to first bend, then bend-to-bend,
    // then last bend to handle position. Filters out duplicate points so
    // sharp corners don't double-render.
    const points = [
      { x: props.sourceX, y: props.sourceY },
      ...bends,
      { x: props.targetX, y: props.targetY },
    ]
    const dedup: { x: number; y: number }[] = []
    for (const p of points) {
      const last = dedup[dedup.length - 1]
      if (!last || Math.abs(last.x - p.x) > 0.5 || Math.abs(last.y - p.y) > 0.5) {
        dedup.push(p)
      }
    }
    const d = dedup
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
      .join(' ')
    return [d, props.sourceX, props.sourceY] as const
  }

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
    stroke-linejoin="round"
    opacity="0.18"
  />
  <path
    class="flow-edge__line"
    :d="path[0]"
    :stroke="color"
    fill="none"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
  />
  <path
    class="flow-edge__flow"
    :d="path[0]"
    :stroke="color"
    fill="none"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
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
