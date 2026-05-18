<script setup lang="ts">
import { computed, inject, onBeforeUnmount, ref } from 'vue'
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

const baseColor = computed(() => colorVar[props.data.color ?? 'cyan'])
const title = computed(() => props.data.title ?? 'Node Group')
const headerHeight = computed(() => props.data.headerHeight ?? 32)

// ─── Edit mode ─────────────────────────────────────────────────────────────
// Double-click the header → group turns orange and all 8 resize handles
// (4 corners + 4 sides) appear. Click outside, double-click again, or press
// Esc to exit. While editing, the vue-flow wrapper is forced interactive so
// drags don't escape on small mouse jitters.
const editing = ref(false)
const rootEl = ref<HTMLDivElement | null>(null)

function getWrapper(): HTMLElement | null {
  return rootEl.value?.closest<HTMLElement>('.vue-flow__node') ?? null
}

function setWrapperInteractive(on: boolean) {
  const w = getWrapper()
  if (!w) return
  w.style.pointerEvents = on ? 'auto' : ''
}

function enterEdit() {
  if (editing.value) return
  editing.value = true
  setWrapperInteractive(true)
  document.addEventListener('pointerdown', onDocPointerDown, true)
  document.addEventListener('keydown', onDocKey, true)
}

function leaveEdit() {
  if (!editing.value) return
  editing.value = false
  setWrapperInteractive(false)
  document.removeEventListener('pointerdown', onDocPointerDown, true)
  document.removeEventListener('keydown', onDocKey, true)
}

function onHeaderDblClick(ev: MouseEvent) {
  ev.stopPropagation()
  if (editing.value) leaveEdit()
  else enterEdit()
}

function onDocPointerDown(ev: PointerEvent) {
  const root = rootEl.value
  if (root && ev.target instanceof Node && !root.contains(ev.target)) {
    leaveEdit()
  }
}

function onDocKey(ev: KeyboardEvent) {
  if (ev.key === 'Escape') {
    ev.preventDefault()
    leaveEdit()
  }
}

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocPointerDown, true)
  document.removeEventListener('keydown', onDocKey, true)
})

// ─── Resize from any side ──────────────────────────────────────────────────
type Dir = { n?: boolean; s?: boolean; e?: boolean; w?: boolean }
const resizing = ref(false)

const MIN_W = 80
const MIN_H = 60

function parseTranslate(transform: string): { x: number; y: number } {
  // vue-flow writes inline "transform: translate(<x>px, <y>px)"
  const m = transform.match(/translate\((-?\d+(?:\.\d+)?)px,\s*(-?\d+(?:\.\d+)?)px\)/)
  if (m) return { x: parseFloat(m[1]!), y: parseFloat(m[2]!) }
  // some builds emit translate3d
  const m3 = transform.match(/translate3d\((-?\d+(?:\.\d+)?)px,\s*(-?\d+(?:\.\d+)?)px/)
  if (m3) return { x: parseFloat(m3[1]!), y: parseFloat(m3[2]!) }
  return { x: 0, y: 0 }
}

function onResizeStart(ev: PointerEvent, dir: Dir) {
  if (ev.button !== 0) return
  ev.preventDefault()
  ev.stopPropagation()
  resizing.value = true
  const handle = ev.currentTarget as HTMLElement
  const wrapper = handle.closest<HTMLElement>('.vue-flow__node')
  if (!wrapper) return
  handle.setPointerCapture(ev.pointerId)

  const startW = wrapper.offsetWidth
  const startH = wrapper.offsetHeight
  const { x: startX, y: startY } = parseTranslate(wrapper.style.transform)
  const startMouseX = ev.clientX
  const startMouseY = ev.clientY
  const zoom = viewport.value.zoom || 1

  let raf: number | null = null
  let lastEv = ev
  let curW = startW
  let curH = startH
  let curX = startX
  let curY = startY

  function flush() {
    raf = null
    const dx = (lastEv.clientX - startMouseX) / zoom
    const dy = (lastEv.clientY - startMouseY) / zoom

    let nW = startW
    let nH = startH
    let nX = startX
    let nY = startY

    if (dir.e) nW = Math.max(MIN_W, startW + dx)
    if (dir.s) nH = Math.max(MIN_H, startH + dy)
    if (dir.w) {
      const proposedW = Math.max(MIN_W, startW - dx)
      nX = startX + (startW - proposedW)
      nW = proposedW
    }
    if (dir.n) {
      const proposedH = Math.max(MIN_H, startH - dy)
      nY = startY + (startH - proposedH)
      nH = proposedH
    }

    curW = nW
    curH = nH
    curX = nX
    curY = nY
    wrapper!.style.width = `${nW}px`
    wrapper!.style.height = `${nH}px`
    if (dir.w || dir.n) {
      wrapper!.style.transform = `translate(${nX}px, ${nY}px)`
    }
  }

  function onMove(e: PointerEvent) {
    lastEv = e
    if (raf == null) raf = requestAnimationFrame(flush)
  }

  function onUp() {
    handle.removeEventListener('pointermove', onMove)
    handle.removeEventListener('pointerup', onUp)
    handle.removeEventListener('pointercancel', onUp)
    if (raf != null) cancelAnimationFrame(raf)
    resizing.value = false
    groupPatch(props.id, {
      x: Math.round(curX),
      y: Math.round(curY),
      width: Math.round(curW),
      height: Math.round(curH),
    })
  }

  handle.addEventListener('pointermove', onMove)
  handle.addEventListener('pointerup', onUp)
  handle.addEventListener('pointercancel', onUp)
}

// Active frame color: orange in edit mode, otherwise the group's own color.
const frameColor = computed(() =>
  editing.value ? 'var(--accent-orange)' : baseColor.value,
)
</script>

<template>
  <!-- Default: decorative frame, pointer-events:none on the wrapper lets pan
       pass through. The header and the SE corner handle are interactive at
       all times. Double-click the header to enter edit mode → frame turns
       orange and 8 sides+corners become draggable. -->
  <div
    ref="rootEl"
    class="group-node"
    :class="{
      'group-node--editing': editing,
      'group-node--resizing': resizing,
    }"
    :style="{ '--gc': frameColor, '--gh': headerHeight + 'px' }"
  >
    <div
      class="group-node__header"
      :title="editing ? 'Двойной клик — выйти из правки рамки' : 'Двойной клик — редактировать рамку'"
      @dblclick="onHeaderDblClick"
    >
      <Folder :size="13" :stroke-width="2" class="group-node__icon" />
      <span class="group-node__title">{{ title }}</span>
    </div>

    <!-- Always-on SE corner — quick resize without entering edit mode. -->
    <div
      v-if="!editing"
      class="group-node__resize-handle group-node__resize-handle--se nodrag nopan"
      :title="'Потяни, чтобы изменить размер рамки'"
      @pointerdown="onResizeStart($event, { e: true, s: true })"
    />

    <!-- Full 8-direction edit-mode handles. -->
    <template v-if="editing">
      <div
        class="group-node__edge group-node__edge--n nodrag nopan"
        @pointerdown="onResizeStart($event, { n: true })"
      />
      <div
        class="group-node__edge group-node__edge--s nodrag nopan"
        @pointerdown="onResizeStart($event, { s: true })"
      />
      <div
        class="group-node__edge group-node__edge--w nodrag nopan"
        @pointerdown="onResizeStart($event, { w: true })"
      />
      <div
        class="group-node__edge group-node__edge--e nodrag nopan"
        @pointerdown="onResizeStart($event, { e: true })"
      />
      <div
        class="group-node__corner group-node__corner--nw nodrag nopan"
        @pointerdown="onResizeStart($event, { n: true, w: true })"
      />
      <div
        class="group-node__corner group-node__corner--ne nodrag nopan"
        @pointerdown="onResizeStart($event, { n: true, e: true })"
      />
      <div
        class="group-node__corner group-node__corner--sw nodrag nopan"
        @pointerdown="onResizeStart($event, { s: true, w: true })"
      />
      <div
        class="group-node__corner group-node__corner--se nodrag nopan"
        @pointerdown="onResizeStart($event, { s: true, e: true })"
      />
    </template>
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
  overflow: visible; /* edge handles spill 4px out for easier grab */
  pointer-events: none;
  user-select: none;
  transition: box-shadow 0.15s, border-color 0.15s;
}

.group-node--editing {
  background: rgba(38, 22, 10, 0.45);
  border-style: solid;
  border-width: 2px;
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.03),
    0 0 0 1px var(--accent-orange),
    0 0 28px var(--accent-orange);
}

.group-node--resizing {
  transition: none;
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
  /* the header is always interactive so users can dbl-click to enter edit */
  pointer-events: auto;
  cursor: pointer;
}

.group-node--editing .group-node__header {
  background: linear-gradient(180deg, rgba(54, 30, 12, 0.95), rgba(28, 16, 8, 0.85));
  border-bottom-style: solid;
  cursor: default;
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

/* ── default SE handle (always visible when not editing) ───────────────── */
.group-node__resize-handle {
  position: absolute;
  pointer-events: auto;
  z-index: 2;
  opacity: 0.55;
  transition: opacity 0.12s;
}

.group-node__resize-handle:hover {
  opacity: 1;
}

.group-node__resize-handle--se {
  right: 0;
  bottom: 0;
  width: 16px;
  height: 16px;
  cursor: nwse-resize;
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
}

/* ── edit-mode edges and corners ───────────────────────────────────────── */
.group-node__edge {
  position: absolute;
  pointer-events: auto;
  z-index: 2;
  background: transparent;
  transition: background 0.12s;
}

.group-node__edge:hover,
.group-node--resizing .group-node__edge {
  background: color-mix(in oklab, var(--accent-orange) 30%, transparent);
}

.group-node__edge--n {
  top: -4px;
  left: 8px;
  right: 8px;
  height: 8px;
  cursor: ns-resize;
}
.group-node__edge--s {
  bottom: -4px;
  left: 8px;
  right: 8px;
  height: 8px;
  cursor: ns-resize;
}
.group-node__edge--w {
  left: -4px;
  top: 8px;
  bottom: 8px;
  width: 8px;
  cursor: ew-resize;
}
.group-node__edge--e {
  right: -4px;
  top: 8px;
  bottom: 8px;
  width: 8px;
  cursor: ew-resize;
}

.group-node__corner {
  position: absolute;
  pointer-events: auto;
  z-index: 3;
  width: 12px;
  height: 12px;
  background: var(--accent-orange);
  border: 2px solid #1a1408;
  border-radius: 2px;
  box-shadow: 0 0 6px var(--accent-orange);
}

.group-node__corner--nw {
  top: -6px;
  left: -6px;
  cursor: nwse-resize;
}
.group-node__corner--ne {
  top: -6px;
  right: -6px;
  cursor: nesw-resize;
}
.group-node__corner--sw {
  bottom: -6px;
  left: -6px;
  cursor: nesw-resize;
}
.group-node__corner--se {
  bottom: -6px;
  right: -6px;
  cursor: nwse-resize;
}
</style>

<style>
/* Global rule (unscoped) so it can target the wrapper vue-flow generates.
   No !important so inline `wrapper.style.pointerEvents='auto'` (set when
   the user enters edit mode) wins, and so :has() override below works. */
.vue-flow__node-group-container {
  pointer-events: none;
}
/* Belt-and-braces: when our inner node is in edit mode, also re-enable
   the wrapper via :has() in CSS — supported in evergreen browsers. */
.vue-flow__node-group-container:has(.group-node--editing) {
  pointer-events: auto;
}
</style>
