<!-- 工具调用行：与思考行同一套折叠样式，展开后在竖线内展示调用与结果。 -->
<template>
  <details class="tool-row agent-disclosure" :data-status="status">
    <summary>
      <span class="tool-row__icon" role="img" :aria-label="statusLabel">
        <LoadingSpinner v-if="status === 'running'" />
        <component :is="statusIcon" v-else />
      </span>
      <span class="tool-row__label">{{ label }}</span>
      <span v-if="durationLabel" class="tool-row__meta">{{ durationLabel }}</span>
      <IconChevronRight class="tool-row__toggle" aria-hidden="true" />
    </summary>

    <div class="agent-disclosure__body">
      <div class="tool-row__section">
        <span class="tool-row__caption">{{ text.input }}</span>
        <span class="tool-row__value">{{ inputSummary }}</span>
      </div>
      <div v-if="summary" class="tool-row__section">
        <span class="tool-row__caption">{{ text.result }}</span>
        <span class="tool-row__value">{{ summary }}</span>
      </div>
      <p v-if="resultText" class="tool-row__output">{{ resultText }}</p>
      <div v-if="failure" class="tool-row__error" role="alert">
        <strong>{{ failure.code }}</strong>
        <span>{{ failure.message }}</span>
        <span v-if="failure.recommendedAction">
          {{ text.recommended }}: {{ failure.recommendedAction }}
        </span>
      </div>
      <p v-if="runningOutput" class="tool-row__output">{{ runningOutput }}</p>
      <div v-if="evidence" class="tool-row__evidence">
        <span v-if="evidence.symbol">{{ evidence.symbol }}</span>
        <span v-if="evidence.period">{{ evidence.period }}</span>
        <span v-if="evidence.range">{{ evidence.range }}</span>
        <span v-if="evidence.source">{{ evidence.source }}</span>
        <span v-if="evidence.timezone">{{ evidence.timezone }}</span>
        <span v-if="evidence.returned !== undefined">{{ evidence.returned }} rows</span>
      </div>
    </div>
  </details>
</template>

<script setup lang="ts">
  import LoadingSpinner from '@vue-src/components/common/feedback/LoadingSpinner.vue'
  import { computed } from 'vue'
  import IconAlertTriangle from '~icons/tabler/alert-triangle'
  import IconCheck from '~icons/tabler/check'
  import IconChevronRight from '~icons/tabler/chevron-right'
  import IconClock from '~icons/tabler/clock'
  import type { ToolCall, ToolResultMessage } from '../agent-contracts.js'
  import { type AgentLocale, getAgentCopy } from '../agent-copy.js'
  import type { LiveToolView } from '../workspace/impl/agent-live.js'
  import { readResultText, readToolPresentation } from './impl/tool-view.js'

  const props = defineProps<{
    call: ToolCall
    result?: ToolResultMessage
    slot?: LiveToolView
    locale: AgentLocale
  }>()

  const text = computed(() => getAgentCopy(props.locale))
  const presentation = computed(() =>
    readToolPresentation(props.result?.details ?? props.slot?.details),
  )
  const status = computed<'pending' | 'running' | 'succeeded' | 'failed'>(() => {
    if (props.result) return props.result.isError ? 'failed' : 'succeeded'
    if (props.slot?.status === 'running') return 'running'
    return 'pending'
  })
  const statusLabel = computed(() => text.value.status[status.value])
  const label = computed(() => presentation.value.label ?? props.call.name)
  const inputSummary = computed(
    () => presentation.value.inputSummary ?? JSON.stringify(props.call.arguments),
  )
  const summary = computed(() => presentation.value.summary)
  const resultText = computed(() =>
    props.result ? readResultText(props.result.content) : undefined,
  )
  const runningOutput = computed(() =>
    status.value === 'running' ? props.slot?.output : undefined,
  )
  const failure = computed(() => presentation.value.failure)
  const evidence = computed(() => presentation.value.evidence)
  const statusIcon = computed(() =>
    status.value === 'failed'
      ? IconAlertTriangle
      : status.value === 'succeeded'
        ? IconCheck
        : IconClock,
  )
  // 官方结果给出毫秒耗时，行内只展示一段紧凑时长。
  const durationLabel = computed(() => {
    const duration = props.result?.durationMs
    if (duration === undefined) return undefined
    return duration < 1_000 ? `${Math.round(duration)}ms` : `${(duration / 1_000).toFixed(1)}s`
  })
</script>

<style scoped>
  .tool-row__icon {
    display: grid;
    place-items: center;
    flex: none;
    width: var(--agent-inline-icon);
    height: var(--agent-inline-icon);
    color: var(--klc-color-ui-muted);
  }

  .tool-row__icon > svg {
    width: var(--agent-inline-icon);
    height: var(--agent-inline-icon);
  }

  .tool-row[data-status='succeeded'] .tool-row__icon {
    color: var(--klc-color-ui-success);
  }

  .tool-row[data-status='failed'] .tool-row__icon {
    color: var(--klc-color-ui-danger-text);
  }

  .tool-row__label {
    flex: 0 1 auto;
    min-width: 0;
    overflow: hidden;
    color: var(--klc-color-ui-text);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tool-row__meta {
    flex: none;
    white-space: nowrap;
  }

  .tool-row__toggle {
    flex: none;
    color: var(--klc-color-ui-muted);
    transition: transform var(--klc-motion-dur-fast) var(--klc-motion-ease-standard);
  }

  .tool-row[open] .tool-row__toggle {
    transform: rotate(90deg);
  }

  /* 展开内容：竖线与间距由共享的 agent-disclosure__body 提供。 */
  .tool-row__section {
    display: grid;
    gap: 2px;
    min-width: 0;
  }

  .tool-row__caption {
    color: var(--klc-color-ui-muted);
    font-size: 10px;
    text-transform: uppercase;
  }

  .tool-row__value {
    color: var(--klc-color-ui-text);
    overflow-wrap: anywhere;
  }

  .tool-row__output {
    max-height: 220px;
    margin: 0;
    overflow-y: auto;
    color: var(--klc-color-ui-text);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .tool-row__error {
    display: grid;
    gap: 2px;
    color: var(--klc-color-ui-danger-text);
    overflow-wrap: anywhere;
  }

  .tool-row__evidence {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    font-size: 10px;
  }
</style>
