<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'
import {
  ChevronDown,
  Check,
  Plus,
  Copy,
  Pencil,
  Trash2,
  FileText,
} from 'lucide-vue-next'
import type { SavedGraph } from '../storage/graphs'

const props = defineProps<{
  graphs: SavedGraph[]
  currentId: string
}>()

const emit = defineEmits<{
  select: [id: string]
  add: []
  duplicate: [id: string]
  rename: [id: string, name: string]
  remove: [id: string]
}>()

const open = ref(false)
const rootEl = ref<HTMLDivElement | null>(null)
const renamingId = ref<string | null>(null)
const renameValue = ref('')

const current = computed(() =>
  props.graphs.find((g) => g.id === props.currentId),
)
const currentName = computed(() => current.value?.name ?? '—')

function onDocPointerDown(ev: PointerEvent) {
  if (!open.value) return
  const root = rootEl.value
  if (root && ev.target instanceof Node && !root.contains(ev.target)) {
    finishRenameOrCancel()
    open.value = false
  }
}

function toggle() {
  open.value = !open.value
  if (open.value) {
    document.addEventListener('pointerdown', onDocPointerDown, true)
  } else {
    document.removeEventListener('pointerdown', onDocPointerDown, true)
  }
}

function pick(id: string) {
  if (renamingId.value) return // ignore selection during rename
  emit('select', id)
  open.value = false
  document.removeEventListener('pointerdown', onDocPointerDown, true)
}

function startRename(g: SavedGraph) {
  renamingId.value = g.id
  renameValue.value = g.name
  nextTick(() => {
    const el = rootEl.value?.querySelector<HTMLInputElement>(
      `input[data-rename="${g.id}"]`,
    )
    el?.focus()
    el?.select()
  })
}

function commitRename(g: SavedGraph) {
  const v = renameValue.value.trim()
  if (v && v !== g.name) emit('rename', g.id, v)
  renamingId.value = null
}

function cancelRename() {
  renamingId.value = null
}

function finishRenameOrCancel() {
  if (renamingId.value) {
    const g = props.graphs.find((x) => x.id === renamingId.value)
    if (g) commitRename(g)
  }
}

function onRenameKey(ev: KeyboardEvent, g: SavedGraph) {
  if (ev.key === 'Enter') {
    ev.preventDefault()
    commitRename(g)
  }
  if (ev.key === 'Escape') {
    ev.preventDefault()
    cancelRename()
  }
}

function add() {
  emit('add')
}

function dup(g: SavedGraph) {
  emit('duplicate', g.id)
}

function remove(g: SavedGraph) {
  if (props.graphs.length <= 1) return // keep at least one
  if (confirm(`Удалить граф «${g.name}»? Это действие необратимо.`)) {
    emit('remove', g.id)
  }
}

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocPointerDown, true)
})
</script>

<template>
  <div ref="rootEl" class="picker" :class="{ 'picker--open': open }">
    <button
      class="picker__trigger"
      type="button"
      :title="'Выбрать или создать граф'"
      @click="toggle"
    >
      <FileText :size="13" :stroke-width="2" class="picker__trigger-icon" />
      <span class="picker__trigger-label">{{ currentName }}</span>
      <ChevronDown :size="12" :stroke-width="2.2" class="picker__chevron" />
    </button>

    <div v-if="open" class="picker__popover">
      <div class="picker__list">
        <div
          v-for="g in graphs"
          :key="g.id"
          class="picker__item"
          :class="{ 'picker__item--active': g.id === currentId }"
          @click="pick(g.id)"
        >
          <Check
            v-if="g.id === currentId"
            :size="12"
            :stroke-width="2.5"
            class="picker__check"
          />
          <span v-else class="picker__check picker__check--placeholder" />

          <template v-if="renamingId === g.id">
            <input
              :data-rename="g.id"
              v-model="renameValue"
              class="picker__rename-input nodrag nopan"
              spellcheck="false"
              @click.stop
              @pointerdown.stop
              @keydown="onRenameKey($event, g)"
              @blur="commitRename(g)"
            />
          </template>
          <template v-else>
            <span class="picker__name">{{ g.name }}</span>
          </template>

          <span class="picker__actions" @click.stop>
            <button
              v-if="renamingId !== g.id"
              type="button"
              class="picker__action-btn"
              title="Переименовать"
              @click="startRename(g)"
              @pointerdown.stop
            >
              <Pencil :size="11" :stroke-width="2" />
            </button>
            <button
              v-if="renamingId !== g.id"
              type="button"
              class="picker__action-btn"
              title="Дублировать"
              @click="dup(g)"
              @pointerdown.stop
            >
              <Copy :size="11" :stroke-width="2" />
            </button>
            <button
              v-if="renamingId !== g.id"
              type="button"
              class="picker__action-btn picker__action-btn--danger"
              :title="graphs.length <= 1 ? 'Нельзя удалить последний граф' : 'Удалить'"
              :disabled="graphs.length <= 1"
              @click="remove(g)"
              @pointerdown.stop
            >
              <Trash2 :size="11" :stroke-width="2" />
            </button>
          </span>
        </div>
      </div>

      <div class="picker__divider" />

      <button class="picker__add" type="button" @click="add">
        <Plus :size="13" :stroke-width="2.2" />
        <span>Новый граф</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.picker {
  position: relative;
  display: inline-block;
}

.picker__trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 24px;
  padding: 0 8px 0 7px;
  background: var(--node-bg);
  border: 1px solid var(--node-border);
  border-radius: 5px;
  color: var(--text);
  font-size: 11px;
  font-family: var(--font-mono);
  cursor: pointer;
  transition:
    border-color 0.15s,
    background 0.15s,
    color 0.15s;
}

.picker__trigger:hover {
  border-color: var(--accent-cyan);
  color: var(--accent-cyan);
}

.picker--open .picker__trigger {
  border-color: var(--accent-cyan);
  color: var(--accent-cyan);
  background: rgba(79, 209, 255, 0.06);
}

.picker__trigger-icon {
  color: var(--text-faint);
  flex-shrink: 0;
}

.picker--open .picker__trigger-icon,
.picker__trigger:hover .picker__trigger-icon {
  color: var(--accent-cyan);
}

.picker__trigger-label {
  max-width: 280px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.picker__chevron {
  color: var(--text-faint);
  transition: transform 0.15s;
}

.picker--open .picker__chevron {
  transform: rotate(180deg);
  color: var(--accent-cyan);
}

.picker__popover {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 50;
  min-width: 320px;
  max-width: 460px;
  background: var(--node-bg);
  border: 1px solid var(--node-border);
  border-radius: 8px;
  box-shadow:
    0 16px 40px rgba(0, 0, 0, 0.55),
    0 0 0 1px rgba(255, 255, 255, 0.02);
  overflow: hidden;
  font-family: var(--font-ui);
}

.picker__list {
  max-height: 320px;
  overflow-y: auto;
  padding: 4px 0;
}

.picker__item {
  display: grid;
  grid-template-columns: 16px 1fr auto;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  cursor: pointer;
  font-size: 12px;
  color: var(--text);
  transition: background 0.1s;
}

.picker__item:hover {
  background: var(--node-row-hover);
}

.picker__item--active {
  background: rgba(79, 209, 255, 0.06);
}

.picker__check {
  color: var(--accent-cyan);
  filter: drop-shadow(0 0 4px var(--accent-cyan));
}

.picker__check--placeholder {
  display: inline-block;
  width: 12px;
  height: 12px;
}

.picker__name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

.picker__rename-input {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text);
  background: var(--node-header-bg);
  border: 1px solid var(--accent-cyan);
  border-radius: 4px;
  padding: 2px 6px;
  outline: none;
  min-width: 0;
  width: 100%;
}

.picker__actions {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.12s;
}

.picker__item:hover .picker__actions,
.picker__item--active .picker__actions {
  opacity: 1;
}

.picker__action-btn {
  display: inline-grid;
  place-items: center;
  width: 22px;
  height: 22px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 4px;
  color: var(--text-faint);
  cursor: pointer;
  padding: 0;
  transition:
    color 0.12s,
    border-color 0.12s,
    background 0.12s;
}

.picker__action-btn:hover:not(:disabled) {
  color: var(--accent-cyan);
  border-color: var(--accent-cyan);
  background: rgba(79, 209, 255, 0.08);
}

.picker__action-btn--danger:hover:not(:disabled) {
  color: var(--accent-magenta);
  border-color: var(--accent-magenta);
  background: rgba(255, 100, 180, 0.08);
}

.picker__action-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.picker__divider {
  height: 1px;
  background: var(--node-divider);
}

.picker__add {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 12px;
  background: transparent;
  border: none;
  border-top: 1px solid var(--node-divider);
  color: var(--text);
  font-family: var(--font-ui);
  font-size: 12px;
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
}

.picker__add:hover {
  background: var(--node-row-hover);
  color: var(--accent-cyan);
}
</style>
