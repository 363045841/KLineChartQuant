<!-- 提问卡片：待答时可以选选项或直接输入，答完折叠为一行结果。 -->
<template>
  <section
    v-if="question.status === 'pending'"
    class="question"
    tabindex="-1"
    data-focus="question"
  >
    <header>
      <IconHelp aria-hidden="true" />
      <div>
        <span>{{ text.question.required }}</span>
        <strong>{{ question.prompt }}</strong>
      </div>
    </header>

    <div
      class="question__options"
      :role="question.multiSelect ? 'group' : 'radiogroup'"
      :aria-label="question.prompt"
    >
      <button
        v-for="(option, index) in question.options"
        :key="option.value"
        type="button"
        class="question__option"
        :role="question.multiSelect ? 'checkbox' : 'radio'"
        :aria-checked="isSelected(option.value)"
        :disabled="submitted"
        @click="toggle(option.value)"
      >
        <span class="question__index">{{ index + 1 }}</span>
        <span class="question__mark" aria-hidden="true"></span>
        <span class="question__text">
          <span>{{ option.label }}</span>
          <small v-if="option.description">{{ option.description }}</small>
        </span>
      </button>
    </div>

    <div class="question__reply">
      <BaseInput
        v-model="note"
        :placeholder="text.question.freeText"
        :disabled="submitted"
        @keydown.enter.prevent="submit"
      />
      <BaseButton size="sm" variant="primary" :disabled="!canSubmit" @click="submit">
        <IconCheck aria-hidden="true" />
        {{ text.question.submit }}
      </BaseButton>
      <BaseButton size="sm" variant="outline" :disabled="submitted" @click="emit('cancel')">
        {{ text.question.cancel }}
      </BaseButton>
    </div>
  </section>

  <div v-else class="question-summary" :data-status="question.status" :title="question.prompt">
    <IconCheck v-if="question.status === 'answered'" aria-hidden="true" />
    <IconX v-else aria-hidden="true" />
    <span class="question-summary__text">{{ summary }}</span>
  </div>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue'
  import IconCheck from '~icons/tabler/check'
  import IconHelp from '~icons/tabler/help'
  import IconX from '~icons/tabler/x'
  import BaseButton from '../../../components/common/BaseButton.vue'
  import BaseInput from '../../../components/common/BaseInput.vue'
  import type { QuestionAnswerView, QuestionView } from '../agent-contracts.js'
  import { type AgentLocale, getAgentCopy } from '../agent-copy.js'

  const props = defineProps<{ question: QuestionView; locale: AgentLocale }>()
  const emit = defineEmits<{ answer: [answer: QuestionAnswerView]; cancel: [] }>()

  const selectedValues = ref<string[]>([])
  const note = ref('')
  /** 提交后立即禁用本卡片，避免连点重复投递；结算状态由父级事件覆盖。 */
  const submitted = ref(false)

  const text = computed(() => getAgentCopy(props.locale))
  const canSubmit = computed(
    () => !submitted.value && (selectedValues.value.length > 0 || note.value.trim().length > 0),
  )

  /** 按 value 反查展示文本；value 不在当前选项中时回退为原值。 */
  const optionLabel = (value: string): string =>
    props.question.options.find((option) => option.value === value)?.label ?? value

  /** 已答显示选择与备注，取消显示未作答；都压成一行。 */
  const summary = computed(() => {
    if (props.question.status !== 'answered') return text.value.question.declined
    const answer = props.question.answer
    const chosen = (answer?.selectedValues ?? []).map(optionLabel).join(', ')
    return [
      chosen ? `${text.value.question.chosen}: ${chosen}` : '',
      answer?.note ?? '',
    ]
      .filter(Boolean)
      .join(' · ')
  })

  /** 判断选项是否已选。 */
  function isSelected(value: string): boolean {
    return selectedValues.value.includes(value)
  }

  /** 单选直接替换选中项并支持再次点击取消；多选切换命中项。 */
  function toggle(value: string): void {
    if (submitted.value) return
    if (props.question.multiSelect) {
      selectedValues.value = isSelected(value)
        ? selectedValues.value.filter((item) => item !== value)
        : [...selectedValues.value, value]
      return
    }
    selectedValues.value = isSelected(value) ? [] : [value]
  }

  /** 提交答复；选项与自由文本至少有一项。 */
  function submit(): void {
    if (!canSubmit.value) return
    submitted.value = true
    const trimmedNote = note.value.trim()
    emit('answer', {
      selectedValues: [...selectedValues.value],
      ...(trimmedNote ? { note: trimmedNote } : {}),
    })
  }
</script>

<style scoped>
  .question {
    display: grid;
    gap: 9px;
    padding: 11px;
    border: 1px solid var(--klc-color-ui-border);
    border-radius: 6px;
    background: var(--klc-color-ui-card);
    color: var(--klc-color-ui-text);
  }

  header {
    display: flex;
    gap: 8px;
    align-items: flex-start;
  }
  header > svg {
    flex: 0 0 auto;
    color: var(--klc-color-ui-accent);
  }
  header div {
    min-width: 0;
    display: grid;
    gap: 2px;
  }
  header span {
    color: var(--klc-color-ui-muted);
    font-size: 10px;
    text-transform: uppercase;
  }
  header strong {
    overflow-wrap: anywhere;
    font-size: 13px;
  }

  .question__options {
    display: grid;
    gap: 5px;
  }
  .question__option {
    min-width: 0;
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 7px 8px;
    border: 1px solid var(--klc-color-ui-border);
    border-radius: 5px;
    color: var(--klc-color-ui-text);
    background: var(--klc-color-agent-composer-input-background);
    font: inherit;
    font-size: 12px;
    text-align: left;
    cursor: pointer;
  }
  .question__option:hover:not(:disabled) {
    border-color: var(--klc-color-ui-border-strong);
    background: var(--klc-color-ui-hover);
  }
  .question__option[aria-checked='true'] {
    border-color: var(--klc-color-ui-accent);
  }
  .question__option:disabled {
    cursor: default;
    opacity: 0.6;
  }
  .question__index {
    flex: 0 0 auto;
    min-width: 14px;
    color: var(--klc-color-ui-muted);
    font-size: 10px;
    line-height: 18px;
    text-align: right;
  }

  /* 自绘选择控件：radio 圆点与 checkbox 对勾均用伪元素绘制，不渲染原生控件外观。 */
  .question__mark {
    flex: 0 0 auto;
    width: 14px;
    height: 14px;
    position: relative;
    margin-top: 2px;
    border: 1px solid var(--klc-color-ui-border-strong);
    background: var(--klc-color-ui-surface);
  }
  .question__option[role='radio'] .question__mark {
    border-radius: 50%;
  }
  .question__option[role='checkbox'] .question__mark {
    border-radius: 3px;
  }
  .question__option[aria-checked='true'] .question__mark {
    border-color: var(--klc-color-ui-accent-strong);
    background: var(--klc-color-ui-accent-strong);
  }
  .question__option[aria-checked='true'][role='radio'] .question__mark::after {
    content: '';
    position: absolute;
    inset: 3px;
    border-radius: 50%;
    background: var(--klc-color-ui-on-accent);
  }
  .question__option[aria-checked='true'][role='checkbox'] .question__mark::after {
    content: '';
    width: 6px;
    height: 3px;
    position: absolute;
    left: 2px;
    top: 4px;
    border: 2px solid var(--klc-color-ui-on-accent);
    border-top: 0;
    border-right: 0;
    transform: rotate(-45deg);
  }

  .question__text {
    min-width: 0;
    display: grid;
    gap: 2px;
  }
  .question__text > span {
    overflow-wrap: anywhere;
  }
  .question__text small {
    overflow-wrap: anywhere;
    color: var(--klc-color-ui-muted);
    font-size: 10px;
  }

  .question__reply {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
  }
  .question__reply input {
    min-width: 0;
    flex: 1 1 160px;
    height: 28px;
  }

  /* 结算后只占一行：图标 + 选择结果，长文本省略并靠 title 提供全文。 */
  .question-summary {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    color: var(--klc-color-ui-muted);
    font-size: 12px;
  }
  .question-summary > svg {
    flex: 0 0 auto;
  }
  .question-summary[data-status='answered'] > svg {
    color: var(--klc-color-ui-success);
  }
  .question-summary__text {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
