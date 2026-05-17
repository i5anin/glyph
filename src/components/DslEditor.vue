<script setup lang="ts">
const model = defineModel<string>({ required: true })

defineProps<{
  error: string | null
}>()
</script>

<template>
  <div class="dsl-editor">
    <div class="dsl-editor__header">
      <span class="dsl-editor__title">obstruction.yaml</span>
      <span v-if="error" class="dsl-editor__status dsl-editor__status--err">● error</span>
      <span v-else class="dsl-editor__status dsl-editor__status--ok">● live</span>
    </div>

    <div v-if="error" class="dsl-editor__error">
      {{ error }}
    </div>

    <textarea
      v-model="model"
      class="dsl-editor__textarea"
      spellcheck="false"
      autocomplete="off"
      autocapitalize="off"
    ></textarea>
  </div>
</template>

<style scoped>
.dsl-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--node-bg);
  border-right: 1px solid var(--node-border);
}

.dsl-editor__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 40px;
  padding: 0 14px;
  background: var(--node-header-bg);
  border-bottom: 1px solid var(--node-divider);
}

.dsl-editor__title {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-dim);
  letter-spacing: 0.02em;
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

.dsl-editor__error {
  padding: 8px 14px;
  background: rgba(255, 107, 107, 0.08);
  border-bottom: 1px solid rgba(255, 107, 107, 0.3);
  color: var(--accent-red);
  font-family: var(--font-mono);
  font-size: 11px;
  line-height: 1.5;
  white-space: pre-wrap;
}

.dsl-editor__textarea {
  flex: 1;
  background: var(--node-bg);
  color: var(--text);
  border: none;
  outline: none;
  resize: none;
  padding: 14px 16px;
  font-family: var(--font-mono);
  font-size: 12.5px;
  line-height: 1.55;
  tab-size: 2;
}

.dsl-editor__textarea::selection {
  background: var(--accent-cyan-soft);
}
</style>
