<script setup lang="ts">
import { computed, inject, ref, type Ref } from 'vue'
import {
  BaseEdge,
  getBezierPath,
  getSmoothStepPath,
  getStraightPath,
  type EdgeProps,
  Position,
  useVueFlow,
} from '@vue-flow/core'
import { ArrowRight } from 'lucide-vue-next'

type EdgeShape = 'smoothstep' | 'step' | 'bezier' | 'straight'

interface EdgeData {
  color?: 'cyan' | 'green' | 'magenta' | 'orange' | 'yellow' | 'gray'
  label?: string
  shape?: EdgeShape
  bends?: { x: number; y: number }[]
  elkStart?: { x: number; y: number }
  elkEnd?: { x: number; y: number }
}

const props = defineProps<EdgeProps<EdgeData>>()

const { findNode, viewport } = useVueFlow()

// ELK bend points are stale the moment a node's dimensions change (collapse,
// drag, etc.) — using them then produces long diagonals from the current
// handle position to the now-misaligned bend. Detect that case and fall back
// to smoothstep, which always adapts to the current handle.
const collapsedSet = inject<Ref<Set<string>>>('glyph:collapsedNodes')

const bendsAreFresh = computed(() => {
  const bends = props.data?.bends
  if (!bends || bends.length === 0) return false
  // If either endpoint is currently collapsed, its handle has moved relative
  // to where ELK computed the bends → polyline would kink ugly.
  if (collapsedSet?.value?.has(props.source)) return false
  if (collapsedSet?.value?.has(props.target)) return false
  return true
})

const path = computed(() => {
  if (bendsAreFresh.value) {
    const bends = props.data!.bends!
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

// ─── Hover tooltip (source → target) ─────────────────────────────────────
const hovered = ref(false)
const mouseX = ref(0)
const mouseY = ref(0)

const sourceTitle = computed(
  () =>
    (findNode(props.source)?.data as { title?: string } | undefined)?.title ??
    props.source,
)
const targetTitle = computed(
  () =>
    (findNode(props.target)?.data as { title?: string } | undefined)?.title ??
    props.target,
)

// Roughly check whether a node is currently within the viewport. We use the
// node's screen coords (canvas → screen via viewport.zoom + viewport.x/y) and
// the window dimensions. Good enough to know when the user can't see the
// other end of the wire.
function nodeOnScreen(id: string): boolean {
  const n = findNode(id)
  if (!n) return true
  const sx = (n.position?.x ?? 0) * viewport.value.zoom + viewport.value.x
  const sy = (n.position?.y ?? 0) * viewport.value.zoom + viewport.value.y
  const w = (n.dimensions?.width ?? 240) * viewport.value.zoom
  const h = (n.dimensions?.height ?? 100) * viewport.value.zoom
  const winW = window.innerWidth
  const winH = window.innerHeight
  return sx + w > 0 && sx < winW && sy + h > 0 && sy < winH
}

const sourceVisible = computed(() => nodeOnScreen(props.source))
const targetVisible = computed(() => nodeOnScreen(props.target))

function onEnter(ev: PointerEvent) {
  hovered.value = true
  mouseX.value = ev.clientX
  mouseY.value = ev.clientY
}
function onMove(ev: PointerEvent) {
  mouseX.value = ev.clientX
  mouseY.value = ev.clientY
}
function onLeave() {
  hovered.value = false
}
</script>

<template>
  <g
    class="flow-edge"
    @pointerenter="onEnter"
    @pointermove="onMove"
    @pointerleave="onLeave"
  >
    <BaseEdge :id="id" :path="path[0]" :style="{ stroke: 'transparent' }" />
    <!-- Wide invisible hit-target so the user doesn't have to land on the
         2px line exactly. pointer-events: stroke makes the transparent
         stroke catch events. -->
    <path
      class="flow-edge__hit"
      :d="path[0]"
      stroke="transparent"
      stroke-width="18"
      fill="none"
    />
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
      :class="{ 'flow-edge__line--hovered': hovered }"
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
  </g>

  <Teleport to="body">
    <div
      v-if="hovered"
      class="flow-edge__tip"
      :style="{
        left: mouseX + 14 + 'px',
        top: mouseY - 12 + 'px',
        '--tc': color,
      }"
    >
      <span class="flow-edge__tip-side" :class="{ 'flow-edge__tip-side--dim': sourceVisible }">
        {{ sourceTitle }}
      </span>
      <ArrowRight :size="13" :stroke-width="2.4" class="flow-edge__tip-arrow" />
      <span class="flow-edge__tip-side" :class="{ 'flow-edge__tip-side--dim': targetVisible }">
        {{ targetTitle }}
      </span>
    </div>
  </Teleport>
</template>

<style>
.flow-edge__hit {
  pointer-events: stroke;
  cursor: pointer;
}

.flow-edge__halo {
  filter: blur(2px);
  pointer-events: none;
}

.flow-edge__line {
  filter: drop-shadow(0 0 3px currentColor);
  pointer-events: none;
  transition: stroke-width 0.12s ease;
}

.flow-edge__line--hovered {
  stroke-width: 3;
  filter: drop-shadow(0 0 6px currentColor);
}

.flow-edge__flow {
  filter: drop-shadow(0 0 4px currentColor);
  animation: flow-stream 0.9s linear infinite;
  pointer-events: none;
}

@keyframes flow-stream {
  to {
    stroke-dashoffset: -16;
  }
}

/* ── Hover tooltip ───────────────────────────────────────── */
.flow-edge__tip {
  position: fixed;
  z-index: 1000;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 5px 10px;
  background: rgba(15, 23, 34, 0.92);
  border: 1px solid var(--tc);
  border-radius: 6px;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text);
  pointer-events: none;
  user-select: none;
  white-space: nowrap;
  backdrop-filter: blur(4px);
  box-shadow: 0 4px 18px rgba(0, 0, 0, 0.5), 0 0 12px var(--tc);
  max-width: 520px;
}

.flow-edge__tip-side {
  color: var(--text);
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  /* dimmed when the corresponding endpoint is already visible on screen —
     the user only really NEEDS the name for off-screen ends */
}

.flow-edge__tip-side--dim {
  color: var(--text-faint);
  font-weight: 400;
}

.flow-edge__tip-arrow {
  color: var(--tc);
  filter: drop-shadow(0 0 4px var(--tc));
  flex-shrink: 0;
}
</style>
