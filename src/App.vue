<script setup lang="ts">
import { ref, shallowRef, watch } from 'vue'
import { watchDebounced } from '@vueuse/core'
import type { Edge, Node } from '@vue-flow/core'
import { parseDsl, DslError } from './dsl/parse'
import { toFlow } from './dsl/toFlow'
import { vueAppDemo } from './demo/vueAppDemo'
import GraphCanvas from './components/GraphCanvas.vue'
import DslEditor from './components/DslEditor.vue'

const dslText = ref(vueAppDemo)
const error = ref<string | null>(null)
const nodes = shallowRef<Node[]>([])
const edges = shallowRef<Edge[]>([])

function apply(text: string) {
  try {
    const doc = parseDsl(text)
    const flow = toFlow(doc)
    nodes.value = flow.nodes
    edges.value = flow.edges
    error.value = null
  } catch (e) {
    if (e instanceof DslError) error.value = e.message
    else error.value = (e as Error).message
  }
}

apply(dslText.value)

watchDebounced(
  dslText,
  (v) => apply(v),
  { debounce: 300, maxWait: 1200 },
)

// keep ref types from being tree-shaken in dev
watch(error, () => {})
</script>

<template>
  <div class="app">
    <header class="app__top">
      <div class="app__brand">
        <span class="app__brand-mark">◆</span>
        <span class="app__brand-name">Glyph</span>
        <span class="app__brand-sub">architecture as glyphs · prototype</span>
      </div>
      <div class="app__hint">
        <span class="kbd">YAML</span> слева →
        <span class="dot dot--cyan"></span><span class="dot dot--green"></span> граф справа
      </div>
    </header>

    <main class="app__main">
      <DslEditor v-model="dslText" :error="error" />
      <GraphCanvas :nodes="nodes" :edges="edges" />
    </main>
  </div>
</template>

<style scoped>
.app {
  display: grid;
  grid-template-rows: 44px 1fr;
  height: 100vh;
  width: 100vw;
  background: var(--bg);
}

.app__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 18px;
  background: var(--node-header-bg);
  border-bottom: 1px solid var(--node-border);
}

.app__brand {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.app__brand-mark {
  color: var(--accent-cyan);
  font-size: 14px;
  text-shadow: 0 0 10px var(--accent-cyan);
}

.app__brand-name {
  font-weight: 600;
  letter-spacing: 0.04em;
  font-size: 13px;
  color: var(--text);
}

.app__brand-sub {
  font-size: 11px;
  color: var(--text-faint);
  font-family: var(--font-mono);
}

.app__hint {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--text-dim);
  font-family: var(--font-mono);
}

.kbd {
  display: inline-block;
  padding: 1px 6px;
  background: var(--node-bg);
  border: 1px solid var(--node-border);
  border-radius: 4px;
  font-size: 10px;
  color: var(--text-value);
}

.dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin: 0 1px;
}
.dot--cyan {
  background: var(--accent-cyan);
  box-shadow: 0 0 6px var(--accent-cyan);
}
.dot--green {
  background: var(--accent-green);
  box-shadow: 0 0 6px var(--accent-green);
}

.app__main {
  display: grid;
  grid-template-columns: 420px 1fr;
  min-height: 0;
}
</style>
