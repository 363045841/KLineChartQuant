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
    min-height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 7px 14px;
    border: 1px solid var(--agent-border);
    border-radius: 999px;
    color: var(--agent-text);
    background: var(--agent-surface);
    font: inherit;
    font-size: 12px;
    text-align: center;
    cursor: pointer;
  }
  .empty-state__prompts button:hover {
    border-color: var(--agent-border-strong);
    background: var(--agent-hover);
  }
  .empty-state__prompts span {
    min-width: 0;
    overflow-wrap: anywhere;
  }
</style>
