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
      <span class="injection-card__action" aria-hidden="true">
        <IconChevronDown />
      </span>
    </button>
    <Transition name="injection-card-expand">
      <div v-if="expanded" :id="contentId" class="injection-card__content">
        <div class="injection-card__content-inner">
          <pre class="injection-card__data">{{ preview }}</pre>
        </div>
      </div>
    </Transition>
  </section>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue'
  import IconChevronDown from '~icons/tabler/chevron-down'
  import type { AgentContextItem } from '../agent-contracts.js'
  import { type AgentLocale, getAgentCopy } from '../agent-copy.js'

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
    display: inline-flex;
    align-items: center;
    color: var(--agent-text);
  }

  .injection-card__action svg {
    width: 14px;
    height: 14px;
    transition: transform 0.15s ease;
  }

  .injection-card__summary[aria-expanded='true'] .injection-card__action svg {
    transform: rotate(180deg);
  }

  .injection-card__content {
    display: grid;
    grid-template-rows: 1fr;
  }

  .injection-card__content-inner {
    min-height: 0;
    overflow: hidden;
  }

  /* 用 0fr→1fr 动画展开/收起，适配内容高度不定的预览面板。 */
  .injection-card-expand-enter-active,
  .injection-card-expand-leave-active {
    transition: grid-template-rows 0.2s ease;
  }

  .injection-card-expand-enter-from,
  .injection-card-expand-leave-to {
    grid-template-rows: 0fr;
  }

  @media (prefers-reduced-motion: reduce) {
    .injection-card-expand-enter-active,
    .injection-card-expand-leave-active {
      transition-duration: 0.01ms;
    }
  }

  .injection-card__data {
    min-width: 0;
    max-height: 220px;
    margin: 8px 12px 10px;
    overflow-y: auto;
    padding: 8px;
    border: 1px solid var(--agent-border);
    border-radius: 3px;
    color: var(--agent-text-soft);
    background: var(--agent-input);
    font-family: var(--klc-typography-font-family-mono);
    font-size: 10px;
    line-height: 1.45;
    overflow-wrap: anywhere;
    white-space: pre-wrap;
  }
</style>
