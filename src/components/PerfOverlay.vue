<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { ChevronsDownUp, ChevronsUpDown, RotateCw, Wand2 } from 'lucide-vue-next'

const props = defineProps<{
  nodes: number
  edges: number
  perf: boolean
}>()

const emit = defineEmits<{
  'collapse-all': []
  'expand-all': []
  relayout: []
  optimize: []
}>()

const optimizing = ref(false)
async function onOptimize() {
  if (optimizing.value) return
  optimizing.value = true
  emit('optimize')
  // Lock UI for ~1.5s — ELK with thoroughness:40 takes noticeable time and
  // we don't want double-clicks queuing up redundant passes.
  setTimeout(() => { optimizing.value = false }, 1500)
}

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
    <div class="perf-overlay__row perf-overlay__row--actions">
      <button
        class="perf-overlay__btn"
        type="button"
        title="Свернуть все ноды (только in/deps)"
        @click="emit('collapse-all')"
      >
        <ChevronsDownUp :size="12" :stroke-width="2" />
      </button>
      <button
        class="perf-overlay__btn"
        type="button"
        title="Развернуть все ноды"
        @click="emit('expand-all')"
      >
        <ChevronsUpDown :size="12" :stroke-width="2" />
      </button>
      <button
        class="perf-overlay__btn"
        type="button"
        title="Пересчитать раскладку (ELK с учётом текущих размеров)"
        @click="emit('relayout')"
      >
        <RotateCw :size="12" :stroke-width="2" />
      </button>
      <button
        class="perf-overlay__btn perf-overlay__btn--accent"
        :class="{ 'perf-overlay__btn--busy': optimizing }"
        type="button"
        title="Оптимизировать пути — минимизировать пересечения, выпрямить рёбра (медленнее)"
        :disabled="optimizing"
        @click="onOptimize"
      >
        <Wand2 :size="12" :stroke-width="2" />
      </button>
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

.perf-overlay__row--actions {
  grid-column: 1 / -1;
  display: flex;
  justify-content: center;
  gap: 4px;
  margin-top: 4px;
  padding-top: 4px;
  border-top: 1px dashed var(--node-divider);
}

.perf-overlay__btn {
  pointer-events: auto;
  display: inline-grid;
  place-items: center;
  width: 22px;
  height: 22px;
  background: transparent;
  border: 1px solid var(--node-divider);
  border-radius: 4px;
  color: var(--text-faint);
  cursor: pointer;
  padding: 0;
  transition:
    color 0.12s ease,
    border-color 0.12s ease,
    background 0.12s ease;
}

.perf-overlay__btn:hover {
  color: var(--accent-cyan);
  border-color: var(--accent-cyan);
  background: rgba(79, 209, 255, 0.08);
}

.perf-overlay__btn--accent {
  color: var(--accent-magenta, #c8a);
  border-color: rgba(204, 136, 187, 0.35);
}
.perf-overlay__btn--accent:hover:not(:disabled) {
  color: var(--accent-magenta, #c8a);
  border-color: var(--accent-magenta, #c8a);
  background: rgba(204, 136, 187, 0.1);
  box-shadow: 0 0 8px rgba(204, 136, 187, 0.3);
}

.perf-overlay__btn--busy {
  cursor: wait;
  animation: perf-pulse 0.9s ease-in-out infinite;
}
.perf-overlay__btn:disabled { opacity: 0.6; }

@keyframes perf-pulse {
  0%, 100% { box-shadow: 0 0 0 rgba(204, 136, 187, 0); }
  50%      { box-shadow: 0 0 10px rgba(204, 136, 187, 0.6); }
}
</style>
