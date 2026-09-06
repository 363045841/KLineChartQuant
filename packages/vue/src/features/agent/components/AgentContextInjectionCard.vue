<template>
  <section v-if="contextItems.length" class="injection-card" :aria-label="text.injectedKLineBars">
    <button
      class="injection-card__summary"
      type="button"
      :aria-expanded="expanded"
      :aria-controls="contentId"
      @click="expanded = !expanded"
    >
      <span class="injection-card__title">{{ text.injectedKLineBars }}</span>
      <span class="injection-card__count"
        >{{ contextItems.length }} {{ text.injectedKLineBarsCount }}</span
      >
      <span class="injection-card__action">
        {{ expanded ? text.hideInjectedKLineBars : text.showInjectedKLineBars }}
      </span>
    </button>
    <div v-if="expanded" :id="contentId" class="injection-card__content">
      <p class="injection-card__description">{{ text.injectedKLineBarsDescription }}</p>
      <pre class="injection-card__data">{{ preview }}</pre>
    </div>
  </section>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue'

  import { getAgentCopy, type AgentLocale } from '../agent-copy'

  import type { AgentContextItem } from '../agent-contracts'

  const props = defineProps<{
    contextItems: ReadonlyArray<AgentContextItem>
    locale: AgentLocale
  }>()

  const contentId = 'agent-context-injection-preview'
  const expanded = ref(false)
  const text = computed(() => getAgentCopy(props.locale))
  // 直接预览传给 Runtime 的完整 ContextItem 数组，避免 UI 投影与实际注入不一致。
  const preview = computed(() => JSON.stringify(props.contextItems, null, 2))
</script>

<style scoped>
  .injection-card {
    border-top: 1px solid var(--agent-border);
    background: var(--agent-surface);
  }

  .injection-card__summary {
    width: 100%;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border: 0;
    color: var(--agent-text-soft);
    background: transparent;
    font: inherit;
    font-size: 11px;
    text-align: left;
    cursor: pointer;
  }

  .injection-card__summary:hover {
    background: var(--agent-hover);
  }

  .injection-card__title {
    overflow: hidden;
    color: var(--agent-text);
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .injection-card__count {
    color: var(--agent-muted);
    white-space: nowrap;
  }

  .injection-card__action {
    color: var(--agent-accent);
    white-space: nowrap;
  }

  .injection-card__content {
    padding: 0 12px 10px;
  }

  .injection-card__description {
    margin: 0 0 7px;
    color: var(--agent-muted);
    font-size: 11px;
    line-height: 1.4;
  }

  .injection-card__data {
    min-width: 0;
    max-height: 220px;
    margin: 0;
    overflow-y: auto;
    padding: 8px;
    border: 1px solid var(--agent-border);
    border-radius: 3px;
    color: var(--agent-text-soft);
    background: var(--agent-input);
    font-family: ui-monospace, SFMono-Regular, Consolas, 'Liberation Mono', monospace;
    font-size: 10px;
    line-height: 1.45;
    overflow-wrap: anywhere;
    white-space: pre-wrap;
  }
</style>
