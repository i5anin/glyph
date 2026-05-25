<script setup lang="ts">
import { computed, inject, ref, type Ref } from 'vue'
import {
  AppWindow,
  ChevronsDownUp,
  ChevronsUpDown,
  ChevronDown,
  ChevronRight,
  Cloud,
  Database,
  FileText,
  Search,
  X,
  CircleDot,
  type LucideIcon,
} from 'lucide-vue-next'
import type { ObstructionDoc, NodeSpec, GroupSpec, AccentColor } from '../dsl/schema'

const props = defineProps<{
  doc: ObstructionDoc
}>()

const emit = defineEmits<{
  'focus-node': [id: string]
  'collapse-all': []
  'expand-all': []
}>()

// Mirror graph-side collapse state — collapsed cards show only the title row
// (no function list), staying in sync with the graph.
const collapsedSet = inject<Ref<Set<string>>>('glyph:collapsedNodes')
const toggleNodeSolo = inject<(id: string) => void>('glyph:toggleNodeSolo')
const selectedNodeId = inject<Ref<string | null>>('glyph:selectedNodeId')

const search = ref('')

const iconMap: Record<string, LucideIcon> = {
  'app-window': AppWindow,
  cloud: Cloud,
  database: Database,
  'file-text': FileText,
}

function iconFor(name: string | undefined): LucideIcon {
  if (!name) return CircleDot
  return iconMap[name] ?? CircleDot
}

const colorVar: Record<AccentColor, string> = {
  cyan: 'var(--accent-cyan)',
  green: 'var(--accent-green)',
  magenta: 'var(--accent-magenta)',
  orange: 'var(--accent-orange)',
  yellow: 'var(--accent-yellow)',
  gray: 'var(--accent-gray)',
}

const groupSpecs = computed(() => {
  const map = new Map<string, GroupSpec>()
  for (const g of props.doc.groups ?? []) map.set(g.id, g)
  return map
})

// Build "node id → { incoming, outgoing }" once
const degree = computed(() => {
  const inc = new Map<string, number>()
  const out = new Map<string, number>()
  for (const e of props.doc.edges) {
    const f = e.from.split('.')[0]
    const t = e.to.split('.')[0]
    if (f) out.set(f, (out.get(f) ?? 0) + 1)
    if (t) inc.set(t, (inc.get(t) ?? 0) + 1)
  }
  return { inc, out }
})

// Pick the dominant color of a node (skip in/deps boilerplate rows)
function nodeColor(n: NodeSpec): AccentColor {
  for (const r of n.rows ?? []) {
    if (r.id === 'in' || r.id === 'deps') continue
    if (r.color) return r.color
  }
  return n.rows?.[0]?.color ?? 'cyan'
}

function functionRows(n: NodeSpec) {
  return (n.rows ?? []).filter((r) => r.id !== 'in' && r.id !== 'deps')
}

// Group nodes by their `group` field. Keep ordering: doc.groups order, then
// any ungrouped nodes go to a synthetic "_ungrouped" bucket at the end.
const groupedNodes = computed(() => {
  const order: string[] = (props.doc.groups ?? []).map((g) => g.id)
  const map = new Map<string, NodeSpec[]>()
  for (const id of order) map.set(id, [])
  map.set('_ungrouped', [])
  for (const n of props.doc.nodes) {
    const key = n.group && map.has(n.group) ? n.group : '_ungrouped'
    map.get(key)!.push(n)
  }
  return map
})

const filteredGroups = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return groupedNodes.value
  const result = new Map<string, NodeSpec[]>()
  for (const [g, nodes] of groupedNodes.value) {
    const filtered = nodes.filter((n) => {
      if (n.title.toLowerCase().includes(q)) return true
      if (n.id.toLowerCase().includes(q)) return true
      return (n.rows ?? []).some((r) => r.label.toLowerCase().includes(q))
    })
    if (filtered.length) result.set(g, filtered)
  }
  return result
})

const totalShown = computed(() => {
  let n = 0
  for (const list of filteredGroups.value.values()) n += list.length
  return n
})

// Collapse/expand groups
const collapsedGroups = ref<Set<string>>(new Set())
function toggleGroup(id: string) {
  const next = new Set(collapsedGroups.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  collapsedGroups.value = next
}

function clearSearch() {
  search.value = ''
}

function isCardCollapsed(n: NodeSpec): boolean {
  return collapsedSet?.value.has(n.id) ?? false
}

function onCardClick(n: NodeSpec) {
  emit('focus-node', n.id)
}

// Клик по шеврону = переключить collapse И телепортироваться к ноде в графе.
// Останавливаем propagation вручную, потому что иначе родительский @click
// карточки выстрелит дважды (focus → focus). Один эмит достаточно.
function onChevronClick(n: NodeSpec, ev: MouseEvent) {
  ev.stopPropagation()
  toggleNodeSolo?.(n.id)
  emit('focus-node', n.id)
}
</script>

<template>
  <div class="cards-list">
    <div class="cards-list__search">
      <Search :size="13" :stroke-width="2" class="cards-list__search-icon" />
      <input
        v-model="search"
        type="text"
        spellcheck="false"
        placeholder="Поиск по имени или функции…"
        class="cards-list__search-input"
      />
      <button
        v-if="search"
        class="cards-list__search-clear"
        type="button"
        title="Очистить"
        @click="clearSearch"
      >
        <X :size="11" :stroke-width="2" />
      </button>
      <button
        class="cards-list__bulk-btn"
        type="button"
        title="Свернуть все карточки"
        @click="emit('collapse-all')"
      >
        <ChevronsDownUp :size="12" :stroke-width="2" />
      </button>
      <button
        class="cards-list__bulk-btn"
        type="button"
        title="Развернуть все карточки"
        @click="emit('expand-all')"
      >
        <ChevronsUpDown :size="12" :stroke-width="2" />
      </button>
    </div>

    <div class="cards-list__scroll">
      <template v-for="[groupId, nodes] in filteredGroups" :key="groupId">
        <div
          v-if="nodes.length"
          class="cards-list__group-head"
          @click="toggleGroup(groupId)"
        >
          <span
            class="cards-list__group-marker"
            :style="{
              background: colorVar[(groupSpecs.get(groupId)?.color ?? 'gray')],
            }"
          />
          <span class="cards-list__group-name">
            {{ groupSpecs.get(groupId)?.title ?? (groupId === '_ungrouped' ? 'без группы' : groupId) }}
          </span>
          <span class="cards-list__group-count">{{ nodes.length }}</span>
        </div>

        <template v-if="!collapsedGroups.has(groupId)">
          <div
            v-for="n in nodes"
            :key="n.id"
            class="cards-list__card"
            :class="{
              'cards-list__card--collapsed': isCardCollapsed(n),
              'cards-list__card--selected': selectedNodeId === n.id,
            }"
            :style="{ '--cc': colorVar[nodeColor(n)] }"
            :title="`Перейти к ${n.title} в графе`"
            @click="onCardClick(n)"
          >
            <div class="cards-list__card-head">
              <button
                v-if="functionRows(n).length"
                class="cards-list__card-chevron"
                type="button"
                :title="isCardCollapsed(n) ? 'Развернуть + перейти' : 'Свернуть + перейти'"
                @click="onChevronClick(n, $event)"
              >
                <component
                  :is="isCardCollapsed(n) ? ChevronRight : ChevronDown"
                  :size="12"
                  :stroke-width="2"
                />
              </button>
              <span v-else class="cards-list__card-chevron-spacer" />
              <component
                :is="iconFor(n.icon)"
                :size="13"
                :stroke-width="2"
                class="cards-list__card-icon"
              />
              <span class="cards-list__card-title" :title="n.title">{{ n.title }}</span>
              <span class="cards-list__card-stats">
                <span class="cards-list__stat" title="imported by">
                  ←{{ degree.inc.get(n.id) ?? 0 }}
                </span>
                <span class="cards-list__stat" title="uses">
                  {{ degree.out.get(n.id) ?? 0 }}→
                </span>
              </span>
            </div>
            <ul
              v-if="functionRows(n).length && !isCardCollapsed(n)"
              class="cards-list__card-fns"
            >
              <li
                v-for="r in functionRows(n)"
                :key="r.id"
                :title="r.label"
              >{{ r.label }}</li>
            </ul>
          </div>
        </template>
      </template>

      <div v-if="!totalShown" class="cards-list__empty">
        Ничего не нашлось
      </div>
    </div>
  </div>
</template>

<style scoped>
.cards-list {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 0;
  background: var(--node-bg);
  overflow: hidden;
}

/* ── Search ───────────────────────────────────────────────── */
.cards-list__search {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: var(--node-bg);
  border-bottom: 1px solid var(--node-divider);
  flex-shrink: 0;
}

.cards-list__search-icon {
  color: var(--text-faint);
  flex-shrink: 0;
}

.cards-list__search-input {
  flex: 1;
  min-width: 0;
  background: transparent;
  border: none;
  outline: none;
  color: var(--text);
  font-family: var(--font-mono);
  font-size: 12px;
}

.cards-list__search-input::placeholder {
  color: var(--text-faint);
}

.cards-list__search-clear,
.cards-list__bulk-btn {
  display: inline-grid;
  place-items: center;
  width: 20px;
  height: 20px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 3px;
  color: var(--text-faint);
  cursor: pointer;
  padding: 0;
  flex-shrink: 0;
  transition:
    color 0.12s ease,
    border-color 0.12s ease,
    background 0.12s ease;
}

.cards-list__search-clear:hover {
  color: var(--accent-magenta);
  border-color: var(--accent-magenta);
}

.cards-list__bulk-btn:hover {
  color: var(--accent-cyan);
  border-color: var(--accent-cyan);
  background: rgba(79, 209, 255, 0.08);
}

/* ── Scroll area ──────────────────────────────────────────── */
.cards-list__scroll {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0 10px;
}

.cards-list__group-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px 4px;
  font-family: var(--font-mono);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-faint);
  cursor: pointer;
  user-select: none;
}

.cards-list__group-head:hover {
  color: var(--text);
}

.cards-list__group-marker {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  box-shadow: 0 0 6px currentColor;
  flex-shrink: 0;
}

.cards-list__group-name {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cards-list__group-count {
  background: var(--node-bg-elev);
  color: var(--text-dim);
  padding: 1px 6px;
  border-radius: 8px;
  font-size: 9px;
  font-weight: 600;
}

/* ── Card ─────────────────────────────────────────────────── */
.cards-list__card {
  margin: 2px 10px;
  padding: 5px 8px;
  background: var(--node-bg-elev);
  border-left: 3px solid var(--cc);
  border-radius: 3px;
  cursor: pointer;
  transition: background 0.12s, box-shadow 0.12s;
}

.cards-list__card:hover {
  background: var(--node-row-hover);
  box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--cc) 50%, transparent);
}

/* Постоянная подсветка последней «найденной» карточки —
   осталась после клика, не сбрасывается на pointerleave */
.cards-list__card--selected {
  background: color-mix(in oklab, var(--cc) 18%, var(--node-bg-elev));
  border-left-width: 4px;
  box-shadow:
    inset 0 0 0 1px var(--cc),
    0 0 14px color-mix(in oklab, var(--cc) 40%, transparent);
}
.cards-list__card--selected:hover {
  background: color-mix(in oklab, var(--cc) 25%, var(--node-bg-elev));
}

.cards-list__card--collapsed {
  opacity: 0.85;
}
/* selected всегда полнотонная даже если карточка collapsed */
.cards-list__card--collapsed.cards-list__card--selected {
  opacity: 1;
}

.cards-list__card-head {
  display: flex;
  align-items: center;
  gap: 6px;
}

.cards-list__card-chevron {
  display: inline-grid;
  place-items: center;
  width: 16px;
  height: 16px;
  margin-left: -2px;
  background: transparent;
  border: none;
  border-radius: 3px;
  color: var(--text-faint);
  cursor: pointer;
  padding: 0;
  flex-shrink: 0;
  transition: color 0.12s, background 0.12s;
}
.cards-list__card-chevron:hover {
  color: var(--cc);
  background: rgba(255, 255, 255, 0.04);
}

.cards-list__card-chevron-spacer {
  width: 16px;
  flex-shrink: 0;
}

.cards-list__card-icon {
  color: var(--cc);
  filter: drop-shadow(0 0 3px var(--cc));
  flex-shrink: 0;
}

.cards-list__card-title {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  color: var(--text);
  font-family: var(--font-mono);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cards-list__card-stats {
  display: inline-flex;
  gap: 6px;
  flex-shrink: 0;
}

.cards-list__stat {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-faint);
  font-variant-numeric: tabular-nums;
}

.cards-list__card-fns {
  list-style: none;
  margin: 4px 0 0;
  padding: 0 0 0 19px;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.cards-list__card-fns li {
  font-size: 11px;
  color: var(--text-dim);
  font-family: var(--font-mono);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.4;
}

.cards-list__card-fns li::before {
  content: '· ';
  color: var(--cc);
}

.cards-list__empty {
  text-align: center;
  padding: 32px 14px;
  color: var(--text-faint);
  font-family: var(--font-mono);
  font-size: 11px;
}
</style>
