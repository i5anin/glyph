<script setup lang="ts">
import { computed, markRaw, watch } from 'vue'
import { VueFlow, useVueFlow, type Edge, type Node } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import ObstructionNode from './ObstructionNode.vue'
import FlowEdge from './FlowEdge.vue'
import JunctionNode from './JunctionNode.vue'
import GroupNode from './GroupNode.vue'

const props = defineProps<{
  nodes: Node[]
  edges: Edge[]
}>()

const nodeTypes = markRaw({
  obstruction: ObstructionNode,
  junction: JunctionNode,
  'group-container': GroupNode,
})

const edgeTypes = markRaw({
  flow: FlowEdge,
})

const nodes = computed(() => props.nodes)
const edges = computed(() => props.edges)

const { onNodesInitialized, fitView } = useVueFlow()

function runFit() {
  requestAnimationFrame(() =>
    fitView({ padding: 0.12, duration: 250, minZoom: 0.85, maxZoom: 1.2 }),
  )
}

onNodesInitialized(runFit)

watch(
  () => props.nodes.map((n) => n.id).join('|'),
  () => {
    setTimeout(runFit, 80)
  },
)
</script>

<template>
  <div class="graph-canvas">
    <VueFlow
      :nodes="nodes"
      :edges="edges"
      :node-types="nodeTypes"
      :edge-types="edgeTypes"
      :min-zoom="0.2"
      :max-zoom="2"
      :nodes-draggable="true"
      :nodes-connectable="false"
      :elements-selectable="true"
      :select-nodes-on-drag="false"
    >
      <Background
        pattern-color="var(--bg-grid)"
        :gap="24"
        :size="1"
        variant="dots"
      />
      <Controls position="bottom-right" />
    </VueFlow>
  </div>
</template>

<style scoped>
.graph-canvas {
  width: 100%;
  height: 100%;
  background: var(--bg);
}
</style>
