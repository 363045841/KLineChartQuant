<template>
  <section
    class="question"
    :data-status="question.status"
    :tabindex="question.status === 'pending' ? -1 : undefined"
    data-focus="question"
  >
    <header>
      <IconHelp aria-hidden="true" />
      <div>
        <span>{{ text.question.required }}</span>
        <strong>{{ question.prompt }}</strong>
      </div>
    </header>

    <template v-if="question.status === 'pending'">
      <div
        class="question__options"
        :role="question.multiSelect ? 'group' : 'radiogroup'"
        :aria-label="question.prompt"
      >
        <button
          v-for="(option, index) in question.options"
          :key="option.label"
          type="button"
          class="question__option"
          :role="question.multiSelect ? 'checkbox' : 'radio'"
          :aria-checked="isSelected(option.label)"
          @click="toggle(option.label)"
        >
          <span class="question__index">{{ index + 1 }}</span>
          <span class="question__mark" aria-hidden="true"></span>
          <span class="question__option-text">
            <span>{{ option.label }}</span>
            <small v-if="option.description">{{ option.description }}</small>
          </span>
        </button>
      </div>

      <div class="question__reply">
        <input
          v-model="note"
          type="text"
          :placeholder="text.question.freeText"
          @keydown.enter.prevent="submit"
        />
        <button type="button" class="question__submit" :disabled="!canSubmit" @click="submit">
          <IconCheck aria-hidden="true" />
          {{ text.question.submit }}
        </button>
      </div>
    </template>

    <div v-else-if="question.status === 'answered'" class="question__resolved">
      <span>{{ text.question.answered }}</span>
      <strong>{{ answeredSummary }}</strong>
    </div>
    <div v-else class="question__resolved">
      <strong>{{ text.question.cancelled }}</strong>
    </div>
  </section>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue'

  import { getAgentCopy, type AgentLocale } from '../agent-copy'

  import type { QuestionAnswerView, QuestionView } from '../agent-contracts'

  import IconCheck from '~icons/tabler/check'
  import IconHelp from '~icons/tabler/help'

  const props = defineProps<{ question: QuestionView; locale: AgentLocale }>()
  const emit = defineEmits<{ answer: [answer: QuestionAnswerView] }>()

  const selectedLabels = ref<string[]>([])
  const note = ref('')

  const text = computed(() => getAgentCopy(props.locale))
  const canSubmit = computed(
    () => selectedLabels.value.length > 0 || note.value.trim().length > 0,
  )
  const answeredSummary = computed(() => {
    const answer = props.question.answer
    if (!answer) return ''
    return [answer.selectedLabels.join(', '), answer.note].filter(Boolean).join(' · ')
  })

  function isSelected(label: string): boolean {
    return selectedLabels.value.includes(label)
  }

  /** 单选直接替换选中项并支持再次点击取消；多选切换命中项。 */
  function toggle(label: string): void {
    if (props.question.multiSelect) {
      selectedLabels.value = isSelected(label)
        ? selectedLabels.value.filter((item) => item !== label)
        : [...selectedLabels.value, label]
      return
    }
    selectedLabels.value = isSelected(label) ? [] : [label]
  }

  function submit(): void {
    if (!canSubmit.value) return
    const trimmedNote = note.value.trim()
    emit('answer', {
      selectedLabels: [...selectedLabels.value],
      ...(trimmedNote ? { note: trimmedNote } : {}),
    })
  }
</script>

<style scoped>
  .question {
    display: grid;
    gap: 9px;
    padding: 11px;
    border: 1px solid var(--agent-border);
    border-radius: 6px;
    background: var(--agent-card);
    color: var(--agent-text);
  }

  header {
    display: flex;
    gap: 8px;
    align-items: flex-start;
  }
  header > svg {
    flex: 0 0 auto;
    color: var(--agent-accent);
  }
  header div {
    min-width: 0;
    display: grid;
    gap: 2px;
  }
  header span {
    color: var(--agent-muted);
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
    border: 1px solid var(--agent-border);
    border-radius: 5px;
    color: var(--agent-text);
    background: var(--agent-input);
    font: inherit;
    font-size: 12px;
    text-align: left;
    cursor: pointer;
  }
  .question__option:hover {
    border-color: var(--agent-border-strong);
    background: var(--agent-hover);
  }
  .question__option[aria-checked='true'] {
    border-color: var(--agent-accent);
  }
  .question__index {
    flex: 0 0 auto;
    min-width: 14px;
    color: var(--agent-muted);
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
    border: 1px solid var(--agent-border-strong);
    background: var(--agent-surface);
  }
  .question__option[role='radio'] .question__mark {
    border-radius: 50%;
  }
  .question__option[role='checkbox'] .question__mark {
    border-radius: 3px;
  }
  .question__option[aria-checked='true'] .question__mark {
    border-color: var(--agent-accent-strong);
    background: var(--agent-accent-strong);
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

  .question__option-text {
    min-width: 0;
    display: grid;
    gap: 2px;
  }
  .question__option-text > span {
    overflow-wrap: anywhere;
  }
  .question__option-text small {
    overflow-wrap: anywhere;
    color: var(--agent-muted);
    font-size: 10px;
  }

  .question__reply {
    display: flex;
    gap: 6px;
    align-items: center;
  }
  .question__reply input {
    min-width: 0;
    flex: 1;
    height: 28px;
    padding: 0 8px;
    border: 1px solid var(--agent-border);
    border-radius: 4px;
    color: var(--agent-text);
    background: var(--agent-input);
    font: inherit;
    font-size: 12px;
  }
  .question__submit {
    min-height: 30px;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 0 10px;
    border: 1px solid var(--agent-accent-strong);
    border-radius: 4px;
    color: var(--klc-color-ui-on-accent);
    background: var(--agent-accent-strong);
    font: inherit;
    font-size: 11px;
    cursor: pointer;
  }
  .question__submit:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .question__resolved {
    display: grid;
    gap: 2px;
  }
  .question__resolved span {
    color: var(--agent-muted);
    font-size: 10px;
    text-transform: uppercase;
  }
  .question__resolved strong {
    overflow-wrap: anywhere;
    font-size: 12px;
    font-weight: 600;
  }
</style>
