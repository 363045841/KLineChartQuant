<!-- 时间线空态：引导文案与快捷提问按钮。 -->
<template>
  <section class="empty-state">
    <h2>{{ text.emptyTitle }}</h2>
    <p>{{ text.emptyBody }}</p>
    <div class="empty-state__prompts">
      <button
        v-for="prompt in prompts"
        :key="prompt"
        type="button"
        @click="$emit('prompt', prompt)"
      >
        <span>{{ prompt }}</span>
        <IconArrowUpRight aria-hidden="true" />
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import IconArrowUpRight from '~icons/tabler/arrow-up-right'
  import { type AgentLocale, getAgentCopy } from '../agent-copy.js'

  const props = defineProps<{ locale: AgentLocale }>()
  defineEmits<{ prompt: [prompt: string] }>()

  const text = computed(() => getAgentCopy(props.locale))
  // 空态只展示固定四条引导，顺序与产品文案对应。
  const prompts = computed(() => [
    text.value.promptTrend,
    text.value.promptRsi,
    text.value.promptEma,
    text.value.promptBond,
  ])
</script>

<style scoped>
  .empty-state {
    min-height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    align-items: stretch;
    gap: 0;
    padding: clamp(var(--klc-space-48, 48px), 12vh, var(--klc-space-96, 96px)) 0
      var(--klc-space-24, 24px);
    color: var(--agent-text);
    text-align: left;
  }

  h2 {
    margin: 0;
    font-size: var(--klc-text-20-font-size, 20px);
    font-weight: var(--klc-text-20-font-weight, 600);
    letter-spacing: var(--klc-text-20-letter-spacing, -0.017em);
    line-height: var(--klc-text-20-line-height, 24px);
  }

  .empty-state > p {
    max-width: 36ch;
    margin: var(--klc-space-8, 8px) 0 var(--klc-space-32, 32px);
    color: var(--agent-text-soft);
    font-size: var(--klc-text-13-font-size, 13px);
    letter-spacing: var(--klc-text-13-letter-spacing, -0.003em);
    line-height: var(--klc-text-13-line-height, 18px);
  }

  .empty-state__prompts {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 0;
    border-top: 1px solid var(--agent-border-strong);
  }

  .empty-state__prompts button {
    width: 100%;
    max-width: 100%;
    min-height: var(--klc-density-comfortable, 40px);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--klc-space-8, 8px);
    padding: var(--klc-space-8, 8px);
    border: 0;
    border-bottom: 1px solid var(--agent-border);
    border-radius: 0;
    color: var(--agent-text);
    background: transparent;
    font: inherit;
    font-size: var(--klc-text-13-font-size, 13px);
    font-weight: var(--klc-text-label-13-font-weight, 500);
    line-height: var(--klc-text-13-line-height, 18px);
    text-align: left;
    cursor: pointer;
    transition:
      color var(--klc-motion-duration-fast) ease,
      background-color var(--klc-motion-duration-fast) ease;
  }

  .empty-state__prompts button:hover {
    background: var(--agent-hover);
    color: var(--agent-accent-strong);
  }

  .empty-state__prompts button:focus-visible {
    outline: 2px solid var(--agent-focus);
    outline-offset: -2px;
  }

  .empty-state__prompts span {
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .empty-state__prompts svg {
    width: 14px;
    height: 14px;
    flex: 0 0 auto;
    color: var(--agent-muted);
    transition:
      color var(--klc-motion-duration-fast) ease,
      transform var(--klc-motion-duration-fast) ease;
  }

  .empty-state__prompts button:hover svg {
    color: var(--agent-accent-strong);
    transform: translate(2px, -2px);
  }

  @media (prefers-reduced-motion: reduce) {
    .empty-state__prompts button,
    .empty-state__prompts svg {
      transition: none;
    }
  }
</style>
