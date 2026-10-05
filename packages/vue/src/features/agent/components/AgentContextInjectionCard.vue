<template>
  <section v-if="contextItems.length" class="injection-card" :aria-label="text.injectedKLineBars">
    <BaseTooltip
      :content="`${text.injectedKLineBars} · ${contextItems.length} ${text.injectedKLineBarsCount}`"
      placement="top"
      trigger-display="contents"
      :disabled="expanded"
    >
    <button
      class="injection-card__summary"
      type="button"
      :aria-label="text.injectedKLineBars"
      :aria-expanded="expanded"
      :aria-controls="contentId"
      @click="expanded = !expanded"
    >
      <span class="injection-card__action" aria-hidden="true">
        <IconEye />
      </span>
    </button>
    </BaseTooltip>
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
  import IconEye from '~icons/tabler/eye'
  import BaseTooltip from '../../../components/common/BaseTooltip.vue'
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
    display: contents;
  }

  .injection-card__summary {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    width: 26px;
    box-sizing: border-box;
    justify-content: center;
    min-height: 26px;
    padding: 3px;
    border: 0;
    border-radius: var(--agent-control-radius, 8px);
    color: var(--agent-muted);
    background: var(--klc-color-agent-composer-input-background);
    font: inherit;
    font-size: 11px;
    text-align: left;
    cursor: pointer;
  }

  .injection-card__summary:hover,
  .injection-card__summary[aria-expanded='true'] {
    background: var(--agent-hover);
  }

  .injection-card__action {
    display: inline-flex;
    align-items: center;
    color: inherit;
  }

  .injection-card__action svg {
    width: 14px;
    height: 14px;
  }

  .injection-card__content {
    min-width: 0;
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
    margin: 0;
    overflow-y: auto;
    padding: 8px;
    border: 1px solid var(--agent-border);
    border-radius: var(--agent-control-radius, 8px);
    color: var(--agent-text-soft);
    background: var(--agent-input);
    font-family: var(--klc-typography-font-family-mono);
    font-size: 10px;
    line-height: 1.45;
    overflow-wrap: anywhere;
    white-space: pre-wrap;
  }
</style>
