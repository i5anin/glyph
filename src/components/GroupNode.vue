<script setup lang="ts">
import { computed, inject, ref } from 'vue'
import type { NodeProps } from '@vue-flow/core'
import { useVueFlow } from '@vue-flow/core'
import { Folder } from 'lucide-vue-next'
import type { GroupSpec, AccentColor } from '../dsl/schema'

type GroupPatchFn = (id: string, patch: Partial<GroupSpec>) => void

const groupPatch = inject<GroupPatchFn>('glyph:groupPatch', () => {})

const props = defineProps<NodeProps<GroupSpec & { headerHeight?: number }>>()

const { viewport } = useVueFlow()

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

// ─── SE resize ────────────────────────────────────────────────────────────
// Live preview during drag via inline overrides on .group-node; final size
// commits up through groupPatch on pointerup so the doc is the source of truth.
const draftW = ref<number | null>(null)
const draftH = ref<number | null>(null)
const resizing = ref(false)

const MIN_W = 80
const MIN_H = 60

function onResizeStart(ev: PointerEvent) {
  if (ev.button !== 0) return
  ev.preventDefault()
  ev.stopPropagation()
  resizing.value = true
  const el = ev.currentTarget as HTMLElement
  // The actual sized element is the vue-flow node wrapper around us.
  // Resize it imperatively for buttery-smooth live preview; the final size
  // commits through groupPatch on pointerup so Vue/state stays in sync.
  const wrapper = el.closest<HTMLElement>('.vue-flow__node')
  const startW = wrapper?.offsetWidth ?? 0
  const startH = wrapper?.offsetHeight ?? 0
  const startX = ev.clientX
  const startY = ev.clientY
  const zoom = viewport.value.zoom || 1
  el.setPointerCapture(ev.pointerId)

  let raf: number | null = null
  let lastEv = ev

  function flush() {
    raf = null
    const dx = (lastEv.clientX - startX) / zoom
    const dy = (lastEv.clientY - startY) / zoom
    const w = Math.max(MIN_W, startW + dx)
    const h = Math.max(MIN_H, startH + dy)
    draftW.value = w
    draftH.value = h
    if (wrapper) {
      wrapper.style.width = `${w}px`
      wrapper.style.height = `${h}px`
    }
  }

  function onMove(e: PointerEvent) {
    lastEv = e
    if (raf == null) raf = requestAnimationFrame(flush)
  }

  function onUp() {
    el.removeEventListener('pointermove', onMove)
    el.removeEventListener('pointerup', onUp)
    el.removeEventListener('pointercancel', onUp)
    if (raf != null) cancelAnimationFrame(raf)
    if (draftW.value != null && draftH.value != null) {
      groupPatch(props.id, {
        width: Math.round(draftW.value),
        height: Math.round(draftH.value),
      })
    }
    draftW.value = null
    draftH.value = null
    resizing.value = false
  }

  el.addEventListener('pointermove', onMove)
  el.addEventListener('pointerup', onUp)
  el.addEventListener('pointercancel', onUp)
}
</script>

<template>
  <!-- Pure visual frame. pointer-events:none on the root lets canvas pan/zoom
       work through the group area; child obstruction nodes are rendered as
       siblings (vue-flow does not DOM-nest them), so they keep their events.
       The header and the SE corner handle re-enable pointer events locally so
       the title can be edited and the frame resized. -->
  <div
    class="group-node"
    :class="{ 'group-node--resizing': resizing }"
    :style="{ '--gc': color, '--gh': headerHeight + 'px' }"
  >
    <div class="group-node__header">
      <Folder :size="13" :stroke-width="2" class="group-node__icon" />
      <span class="group-node__title">{{ title }}</span>
    </div>
    <div
      class="group-node__resize-handle nodrag nopan"
      :title="'Потяни, чтобы изменить размер рамки'"
      @pointerdown="onResizeStart"
    />
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
  overflow: hidden;
  /* the body of the frame is decorative — canvas pan/zoom passes through */
  pointer-events: none;
  user-select: none;
  transition: box-shadow 0.15s;
}

.group-node--resizing {
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.02),
    0 0 0 1px var(--gc),
    0 0 24px var(--gc);
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

/* ── SE resize handle ─────────────────────────────────────
   16×16 square in the bottom-right corner. pointer-events:auto
   to override the parent's pointer-events:none. */
.group-node__resize-handle {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 16px;
  height: 16px;
  cursor: nwse-resize;
  pointer-events: auto;
  background:
    linear-gradient(
      135deg,
      transparent 0%,
      transparent 45%,
      var(--gc) 45%,
      var(--gc) 55%,
      transparent 55%,
      transparent 65%,
      var(--gc) 65%,
      var(--gc) 78%,
      transparent 78%
    );
  opacity: 0.55;
  transition: opacity 0.12s;
  z-index: 2;
}

.group-node__resize-handle:hover,
.group-node--resizing .group-node__resize-handle {
  opacity: 1;
}
</style>

<style>
/* Vue Flow wraps every node in .vue-flow__node-<type> with pointer-events:all
   by default — that intercepts canvas pan/zoom over the group's footprint.
   Make only group containers transparent at the wrapper level; their inner
   resize handle re-enables pointer-events locally so it stays grabbable. */
.vue-flow__node-group-container {
  pointer-events: none !important;
}
.vue-flow__node-group-container .group-node__resize-handle {
  pointer-events: auto;
}
</style>
