<!-- 时间线空态：引导文案与快捷提问按钮。 -->
<template>
  <section class="empty-state">
    <h2>{{ text.emptyTitle }}</h2>
    <p>{{ text.emptyBody }}</p>
    <div class="empty-state__prompts">
      <button
        v-for="prompt in prompts"
        :key="prompt.label"
        type="button"
        @click="emit('prompt', prompt.prompt)"
      >
        <span>{{ prompt.label }}</span>
        <IconArrowUpRight aria-hidden="true" />
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import IconArrowUpRight from '~icons/tabler/arrow-up-right'
  import { type AgentLocale, getAgentCopy } from '../agent-copy.js'

  /** 一个快捷提问：按钮显示短标签，发送完整指令。 */
  interface EmptyStatePrompt {
    readonly label: string
    readonly prompt: string
  }

  const props = defineProps<{ locale: AgentLocale }>()
  const emit = defineEmits<{ prompt: [prompt: string] }>()

  const text = computed(() => getAgentCopy(props.locale))
  // 空态只展示固定引导；订单流那一条标签短、发送的指令带标注规则，避免用户手写口径。
  const prompts = computed<readonly EmptyStatePrompt[]>(() => [
    { label: text.value.promptTrend, prompt: text.value.promptTrend },
    { label: text.value.promptRsi, prompt: text.value.promptRsi },
    { label: text.value.promptEma, prompt: text.value.promptEma },
    { label: text.value.promptBond, prompt: text.value.promptBond },
    { label: text.value.promptOrderflow, prompt: text.value.promptOrderflowDetail },
    { label: text.value.promptOption, prompt: text.value.promptOptionDetail },
  ])
</script>

<style scoped>
  .empty-state {
    min-height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    gap: 8px;
    color: var(--agent-text);
    text-align: center;
  }

  h2 {
    margin: 4px 0 0;
    font-size: 16px;
    line-height: 1.25;
  }
  .empty-state > p {
    margin: 0 0 8px;
    color: var(--agent-muted);
    font-size: 12px;
    line-height: 1.45;
  }

  .empty-state__prompts {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
  }
  .empty-state__prompts button {
    max-width: 100%;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 14px;
    border: 1px solid var(--agent-border);
    border-radius: 999px;
    background: transparent;
    color: var(--agent-text);
    font: inherit;
    font-size: 12px;
    cursor: pointer;
  }
  .empty-state__prompts button:hover {
    border-color: var(--agent-accent);
    color: var(--agent-accent);
  }
  .empty-state__prompts span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .empty-state__prompts svg {
    width: 14px;
    height: 14px;
    flex: none;
  }
</style>
