<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import { Codemirror } from 'vue-codemirror'
import { yaml } from '@codemirror/lang-yaml'
import { EditorView } from '@codemirror/view'
import { Compartment } from '@codemirror/state'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'
import { ChevronLeft } from 'lucide-vue-next'

const model = defineModel<string>({ required: true })

defineProps<{
  error: string | null
}>()

const emit = defineEmits<{
  collapse: []
}>()

// Glyph dark theme for CodeMirror — picks up the Upload Labs palette
const glyphTheme = EditorView.theme(
  {
    '&': {
      color: 'var(--text)',
      backgroundColor: 'var(--node-bg)',
      height: '100%',
      fontSize: '12.5px',
    },
    '.cm-content': {
      caretColor: 'var(--accent-cyan)',
      fontFamily: 'var(--font-mono)',
      padding: '12px 0',
    },
    '.cm-cursor': { borderLeftColor: 'var(--accent-cyan)' },
    '.cm-scroller': { fontFamily: 'var(--font-mono)' },
    '.cm-gutters': {
      backgroundColor: 'var(--node-bg)',
      color: 'var(--text-faint)',
      border: 'none',
      borderRight: '1px solid var(--node-divider)',
    },
    '.cm-activeLineGutter': {
      backgroundColor: 'transparent',
      color: 'var(--text-dim)',
    },
    '.cm-activeLine': { backgroundColor: 'rgba(79, 209, 255, 0.05)' },
    '.cm-selectionBackground, ::selection, .cm-content ::selection': {
      backgroundColor: 'var(--accent-cyan-soft) !important',
    },
    '.cm-line': { padding: '0 14px' },
    '&.cm-focused .cm-selectionBackground': {
      backgroundColor: 'var(--accent-cyan-soft) !important',
    },
    '.cm-matchingBracket, .cm-nonmatchingBracket': {
      backgroundColor: 'rgba(79, 209, 255, 0.18)',
      outline: 'none',
    },
  },
  { dark: true },
)

// Syntax highlight tied to lezer tags from the YAML grammar
const glyphHighlight = HighlightStyle.define([
  { tag: t.propertyName, color: '#4fd1ff', fontWeight: '500' }, // YAML keys
  { tag: t.string, color: '#e4ecf7' }, // quoted strings
  { tag: t.number, color: '#ffa94d' },
  { tag: t.bool, color: '#ff5cf4' },
  { tag: t.null, color: '#ff5cf4' },
  { tag: t.atom, color: '#ffd84d' }, // unquoted scalars like cyan/green
  { tag: t.keyword, color: '#ff5cf4' },
  { tag: t.comment, color: '#5e6f87', fontStyle: 'italic' },
  { tag: t.punctuation, color: '#8a9bb4' },
  { tag: t.bracket, color: '#8a9bb4' },
  { tag: t.separator, color: '#8a9bb4' },
  { tag: t.meta, color: '#8a9bb4' },
  { tag: t.operator, color: '#4fd1ff' },
  { tag: t.invalid, color: '#ff6b6b' },
])

const themeCompartment = new Compartment()

const extensions = computed(() => [
  yaml(),
  themeCompartment.of(glyphTheme),
  syntaxHighlighting(glyphHighlight),
  EditorView.lineWrapping,
])

const view = shallowRef<EditorView | null>(null)
function handleReady(payload: { view: EditorView }) {
  view.value = payload.view
}
</script>

<template>
  <div class="dsl-editor">
    <div class="dsl-editor__header">
      <span class="dsl-editor__title">obstruction.yaml</span>
      <span class="dsl-editor__right">
        <span v-if="error" class="dsl-editor__status dsl-editor__status--err">● error</span>
        <span v-else class="dsl-editor__status dsl-editor__status--ok">● live</span>
        <button
          class="dsl-editor__collapse"
          type="button"
          title="Скрыть YAML"
          @click="emit('collapse')"
        >
          <ChevronLeft :size="14" :stroke-width="2.2" />
        </button>
      </span>
    </div>

    <div v-if="error" class="dsl-editor__error">
      {{ error }}
    </div>

    <Codemirror
      v-model="model"
      class="dsl-editor__cm"
      :style="{ height: '100%', flex: 1 }"
      :autofocus="false"
      :indent-with-tab="false"
      :tab-size="2"
      :extensions="extensions"
      @ready="handleReady"
    />
  </div>
</template>

<style scoped>
.dsl-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--node-bg);
  border-right: 1px solid var(--node-border);
  min-width: 0;
  overflow: hidden;
}

.dsl-editor__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 40px;
  padding: 0 8px 0 14px;
  background: var(--node-header-bg);
  border-bottom: 1px solid var(--node-divider);
  flex-shrink: 0;
}

.dsl-editor__title {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-dim);
  letter-spacing: 0.02em;
}

.dsl-editor__right {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.dsl-editor__status {
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.04em;
}

.dsl-editor__status--ok {
  color: var(--accent-green);
  text-shadow: 0 0 8px var(--accent-green);
}

.dsl-editor__status--err {
  color: var(--accent-red);
  text-shadow: 0 0 8px var(--accent-red);
}

.dsl-editor__collapse {
  display: inline-grid;
  place-items: center;
  width: 24px;
  height: 24px;
  background: transparent;
  border: 1px solid var(--node-divider);
  border-radius: 4px;
  color: var(--text-dim);
  cursor: pointer;
  padding: 0;
  transition:
    border-color 0.15s,
    color 0.15s,
    background 0.15s;
}

.dsl-editor__collapse:hover {
  border-color: var(--accent-cyan);
  color: var(--accent-cyan);
  background: rgba(79, 209, 255, 0.08);
}

.dsl-editor__error {
  padding: 8px 14px;
  background: rgba(255, 107, 107, 0.08);
  border-bottom: 1px solid rgba(255, 107, 107, 0.3);
  color: var(--accent-red);
  font-family: var(--font-mono);
  font-size: 11px;
  line-height: 1.5;
  white-space: pre-wrap;
  flex-shrink: 0;
}

.dsl-editor__cm {
  min-height: 0;
  overflow: hidden;
}

.dsl-editor__cm :deep(.cm-editor) {
  height: 100%;
  outline: none;
}

.dsl-editor__cm :deep(.cm-editor.cm-focused) {
  outline: none;
}
</style>
