<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'

const props = defineProps<{
  nodes: number
  edges: number
  perf: boolean
}>()

const fps = ref(0)

let frames = 0
let lastT = performance.now()
let raf: number | null = null

function loop() {
  frames++
  const now = performance.now()
  const dt = now - lastT
  if (dt >= 500) {
    fps.value = Math.round((frames * 1000) / dt)
    frames = 0
    lastT = now
  }
  raf = requestAnimationFrame(loop)
}

raf = requestAnimationFrame(loop)
onBeforeUnmount(() => {
  if (raf != null) cancelAnimationFrame(raf)
})

// Colorize FPS gauge: green > yellow > red
function fpsColor(v: number): string {
  if (v >= 50) return 'var(--accent-green)'
  if (v >= 30) return 'var(--accent-yellow)'
  return 'var(--accent-magenta)'
}

watch(
  () => props.perf,
  () => {
    // reset frame counter when perf mode toggles to get clean reading
    frames = 0
    lastT = performance.now()
  },
)
</script>

<template>
  <div class="perf-overlay" :class="{ 'perf-overlay--on': perf }">
    <div class="perf-overlay__row">
      <span class="perf-overlay__label">FPS</span>
      <span class="perf-overlay__value" :style="{ color: fpsColor(fps) }">{{ fps }}</span>
    </div>
    <div class="perf-overlay__row">
      <span class="perf-overlay__label">nodes</span>
      <span class="perf-overlay__value">{{ nodes }}</span>
    </div>
    <div class="perf-overlay__row">
      <span class="perf-overlay__label">edges</span>
      <span class="perf-overlay__value">{{ edges }}</span>
    </div>
    <div v-if="perf" class="perf-overlay__row perf-overlay__row--note">
      <span class="perf-overlay__note">perf mode</span>
    </div>
  </div>
</template>

<style scoped>
.perf-overlay {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 10;
  display: grid;
  grid-template-columns: auto auto;
  column-gap: 10px;
  row-gap: 2px;
  padding: 6px 10px;
  background: rgba(15, 23, 34, 0.7);
  border: 1px solid var(--node-border);
  border-radius: 6px;
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-dim);
  user-select: none;
  pointer-events: none;
  backdrop-filter: blur(4px);
}

.perf-overlay__row {
  display: contents;
}

.perf-overlay__label {
  text-align: left;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-faint);
}

.perf-overlay__value {
  text-align: right;
  color: var(--text-value);
  font-variant-numeric: tabular-nums;
}

.perf-overlay__row--note {
  grid-column: 1 / -1;
  text-align: center;
  margin-top: 2px;
  padding-top: 4px;
  border-top: 1px dashed var(--node-divider);
}

.perf-overlay__note {
  color: var(--accent-orange);
  font-size: 9px;
  letter-spacing: 0.04em;
}
</style>
