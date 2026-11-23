<!--
  上下文注入内容预览：眼睛按钮开一个浮层，展示实际交给 Runtime 的 ContextItem 数组。
  预览是浮层而不是上下文条里的一段：条只装胶囊、高度恒定，定位与 Esc / 点击外部收起由 BasePopover 负责，
  因此不需要把展开态提升到外层，也不会遮挡或挤压时间线。
-->
<template>
  <BasePopover
    v-if="contextItems.length"
    :label="text.injectedKLineBars"
    placement="top"
    role="dialog"
    max-width="min(560px, calc(100vw - 24px))"
  >
    <template #trigger="{ props: triggerProps }">
      <button
        v-bind="triggerProps"
        class="injection-card__trigger agent-raised-surface"
        type="button"
        :aria-label="text.injectedKLineBars"
      >
        <IconEye class="injection-card__icon" aria-hidden="true" />
      </button>
    </template>
    <p class="injection-card__caption">
      {{ text.injectedKLineBars }} · {{ contextItems.length }} {{ text.injectedKLineBarsCount }}
    </p>
    <pre class="injection-card__data">{{ preview }}</pre>
  </BasePopover>
</template>

<script setup lang="ts">
  import BasePopover from '@vue-src/components/common/overlay/BasePopover.vue'
  import { computed } from 'vue'
  import IconEye from '~icons/tabler/eye'
  import type { AgentContextItem } from '../agent-contracts.js'
  import { type AgentLocale, getAgentCopy } from '../agent-copy/index.js'
  import './agent-surface.css'

  const props = defineProps<{
    contextItems: ReadonlyArray<AgentContextItem>
    locale: AgentLocale
  }>()

  const text = computed(() => getAgentCopy(props.locale))
  // 直接预览传给 Runtime 的完整 ContextItem 数组，避免 UI 投影与实际注入不一致。
  const preview = computed(() => JSON.stringify(props.contextItems, null, 2))
</script>

<style scoped>
  .injection-card__trigger {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: var(--agent-chip-height, 26px);
    min-height: var(--agent-chip-height, 26px);
    box-sizing: border-box;
    padding: 3px;
    color: var(--klc-color-ui-muted);
    cursor: pointer;
  }

  /* 交互态在卡片底上叠一层，不直接换 background：条本身透明，换成半透明色会露出下面的时间线。 */
  .injection-card__trigger:hover,
  .injection-card__trigger[aria-expanded='true'] {
    background-image: linear-gradient(var(--klc-color-ui-hover), var(--klc-color-ui-hover));
  }

  .injection-card__icon {
    width: var(--klc-space-16, 16px);
    height: var(--klc-space-16, 16px);
  }

  .injection-card__caption {
    margin: 0 0 var(--klc-space-8, 8px);
    color: var(--klc-color-ui-muted);
    font-size: var(--klc-text-12-font-size, 12px);
    line-height: var(--klc-text-12-line-height, 16px);
  }

  /* 表面与滚动都由浮层本体（popover-surface）负责，这里只是内容排版。 */
  .injection-card__data {
    min-width: 0;
    margin: 0;
    color: var(--klc-color-ui-text-soft);
    font-family: var(--klc-font-family-mono);
    font-size: var(--klc-text-11-mono-font-size, 11px);
    font-weight: var(--klc-font-weight-mono);
    line-height: var(--klc-text-11-mono-line-height, 16px);
    overflow-wrap: anywhere;
    white-space: pre-wrap;
  }
</style>
