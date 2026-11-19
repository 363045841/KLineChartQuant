<!-- 运行失败提示：图标与本地化标题同一行，恢复动作是句子内的文字按钮，官方说明另起一行。 -->
<template>
  <section
    v-if="display"
    ref="root"
    class="run-failure"
    :class="`run-failure--${display.tone}`"
    :role="display.tone === 'error' ? 'alert' : 'status'"
    tabindex="-1"
    data-focus="run-failure"
  >
    <div class="run-failure__body">
      <div class="run-failure__head">
        <IconAlertTriangle v-if="display.tone === 'error'" aria-hidden="true" />
        <IconInfoCircle v-else aria-hidden="true" />
        <strong>{{ display.title }}</strong>
        <BaseButton
          v-if="display.action === 'continue'"
          variant="link"
          size="sm"
          @click="emit('resume')"
        >
          {{ text.resumeRun }}
        </BaseButton>
        <BaseButton
          v-else-if="display.action === 'configure'"
          variant="link"
          size="sm"
          @click="emit('configure')"
        >
          {{ text.openModelSettings }}
        </BaseButton>
      </div>
      <p v-if="display.detail" class="run-failure__detail">{{ display.detail }}</p>
    </div>
  </section>
</template>

<script setup lang="ts">
  import BaseButton from '@vue-src/components/common/button/BaseButton.vue'
  import { computed, ref, watch } from 'vue'
  import IconAlertTriangle from '~icons/tabler/alert-triangle'
  import IconInfoCircle from '~icons/tabler/info-circle'
  import { type AgentLocale, getAgentCopy } from '../agent-copy.js'
  import type { RunFailureView } from '../workspace/impl/agent-live.js'
  import { toRunFailureNotice } from './impl/run-failure-view.js'

  const props = defineProps<{ runFailure?: RunFailureView; locale: AgentLocale }>()
  const emit = defineEmits<{ resume: []; configure: [] }>()

  const text = computed(() => getAgentCopy(props.locale))
  const root = ref<HTMLElement | null>(null)
  // 结构、级别与动作一次算完；没有失败或不需要打扰用户时返回 undefined，模板直接不渲染。
  const display = computed(() => {
    if (props.runFailure === undefined) return undefined
    const notice = toRunFailureNotice(props.runFailure)
    if (notice === undefined) return undefined
    return { ...notice, title: text.value.runFailure[notice.reason] }
  })

  // 提示出现（含原因变化）时接管焦点，屏幕阅读器立刻读出失败原因。
  watch(() => props.runFailure?.reason, () => root.value?.focus(), {
    immediate: true,
    flush: 'post',
  })
</script>

<style scoped>
  .run-failure {
    padding: var(--klc-space-8);
    border-radius: var(--klc-radius-sm);
    color: var(--klc-color-ui-text);
  }
  .run-failure--error {
    background: var(--klc-color-ui-danger-background);
  }
  .run-failure--warning {
    background: var(--klc-color-ui-warning-background);
  }
  .run-failure__body {
    display: grid;
    gap: var(--klc-space-2);
    min-width: 0;
  }
  /* 图标、标题与动作共享一行；放不下时动作换行而不是压缩标题。 */
  .run-failure__head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--klc-space-8);
    min-width: 0;
  }
  .run-failure__head > svg {
    flex: 0 0 auto;
    width: 16px;
    height: 16px;
  }
  .run-failure--error .run-failure__head > svg {
    color: var(--klc-color-ui-danger-text);
  }
  .run-failure--warning .run-failure__head > svg {
    color: var(--klc-color-ui-warning-text);
  }
  strong {
    overflow-wrap: anywhere;
    font-size: var(--klc-text-label-12-font-size);
    line-height: var(--klc-text-label-12-line-height);
    font-weight: var(--klc-text-label-12-font-weight);
  }
  .run-failure__detail {
    margin: 0;
    overflow-wrap: anywhere;
    color: var(--klc-color-ui-muted);
    font-family: var(--klc-typography-font-family-mono);
    font-size: var(--klc-text-11-mono-font-size);
    line-height: var(--klc-text-11-mono-line-height);
    font-weight: var(--klc-font-weight-mono);
  }
</style>
