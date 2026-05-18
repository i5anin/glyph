<script setup lang="ts">
import { MousePointer2, Move, BoxSelect, Pin } from 'lucide-vue-next'

export type Tool = 'cursor' | 'move' | 'select' | 'waypoint'

const model = defineModel<Tool>({ required: true })

const tools: { id: Tool; icon: typeof MousePointer2; label: string; hint: string }[] = [
  { id: 'cursor',   icon: MousePointer2, label: 'Курсор',        hint: 'Выделить / редактировать. Drag по ноде — перенос, drag по пустому — pan.' },
  { id: 'move',     icon: Move,          label: 'Перемещение',   hint: 'Drag канваса для панорамирования. Ноды зафиксированы.' },
  { id: 'select',   icon: BoxSelect,     label: 'Рамка',         hint: 'Drag рисует прямоугольник выделения. Несколько объектов сразу.' },
  { id: 'waypoint', icon: Pin,           label: 'Точка обхода',  hint: 'Клик по проводу втыкает junction — провод обогнёт точку.' },
]
</script>

<template>
  <div class="toolbar" role="toolbar" aria-label="Режимы работы">
    <button
      v-for="t in tools"
      :key="t.id"
      class="toolbar__btn"
      :class="{ 'toolbar__btn--active': model === t.id }"
      type="button"
      :title="`${t.label} — ${t.hint}`"
      @click="model = t.id"
    >
      <component :is="t.icon" :size="18" :stroke-width="2" />
    </button>
  </div>
</template>

<style scoped>
.toolbar {
  position: absolute;
  bottom: 16px;
  left: 16px;
  display: inline-flex;
  gap: 2px;
  padding: 4px;
  background: var(--node-bg);
  border: 1px solid var(--node-border);
  border-radius: 8px;
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.02) inset,
    0 8px 28px rgba(0, 0, 0, 0.55);
  z-index: 6;
}

.toolbar__btn {
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  background: transparent;
  border: none;
  border-radius: 6px;
  color: var(--text-dim);
  cursor: pointer;
  padding: 0;
  transition:
    background 0.12s ease,
    color 0.12s ease;
}

.toolbar__btn:hover {
  background: var(--node-row-hover);
  color: var(--text);
}

.toolbar__btn--active {
  background: var(--accent-orange);
  color: #0f1722;
  box-shadow: 0 0 10px color-mix(in oklab, var(--accent-orange) 60%, transparent);
}

.toolbar__btn--active:hover {
  background: var(--accent-orange);
  color: #0f1722;
}
</style>
