<!-- 提问卡片：待答时可选项或输入，已取消时在卡片上方加一行状态并保留只读卡片。 -->
<template>
  <template v-if="question.status !== 'answered'">
    <!-- 已取消：像「思考」一样的一行状态，下面保留只读卡片 -->
    <div
      v-if="settled"
      class="question-summary"
      data-status="cancelled"
      :title="question.prompt"
    >
      <IconHelp aria-hidden="true" />
      <span class="question-summary__text">
        {{ text.question.label }}({{ text.question.declined }})
      </span>
    </div>

    <section class="question agent-bordered-surface" tabindex="-1" data-focus="question">
      <p class="question__prompt">
        <IconHelp aria-hidden="true" />
        <strong>{{ question.prompt }}</strong>
      </p>

      <div
        class="question__options"
        :role="question.multiSelect ? 'group' : 'radiogroup'"
        :aria-label="question.prompt"
      >
        <button
          v-for="option in question.options"
          :key="option.value"
          type="button"
          class="question__option"
          :role="question.multiSelect ? 'checkbox' : 'radio'"
          :aria-checked="isSelected(option.value)"
          :disabled="settled || submitted"
          @click="toggle(option.value)"
        >
          <span class="question__mark" aria-hidden="true"></span>
          <span>{{ option.label }}</span>
          <small v-if="option.description">{{ option.description }}</small>
        </button>
      </div>

      <div v-if="!settled" class="question__reply">
        <BaseInput
          v-model="note"
          :placeholder="text.question.freeText"
          :disabled="submitted"
          @keydown.enter.prevent="submit"
        />
        <IconArrowUp
          class="question__submit"
          :class="{ 'is-disabled': !canSubmit }"
          role="button"
          tabindex="0"
          :aria-label="text.question.submit"
          :aria-disabled="!canSubmit"
          @click="submit"
          @keydown.enter.prevent="submit"
          @keydown.space.prevent="submit"
        />
        <BaseButton variant="link" size="sm" :disabled="submitted" @click="emit('cancel')">
          {{ text.question.cancel }}
        </BaseButton>
      </div>
    </section>
  </template>

  <div v-else class="question-summary" data-status="answered" :title="question.prompt">
    <IconCheck aria-hidden="true" />
    <span class="question-summary__text">{{ summary }}</span>
  </div>
</template>

<script setup lang="ts">
  import BaseButton from '@vue-src/components/common/button/BaseButton.vue'
  import BaseInput from '@vue-src/components/common/form/BaseInput.vue'
  import './agent-surface.css'
  import { computed, ref } from 'vue'
  import IconArrowUp from '~icons/tabler/arrow-up'
  import IconCheck from '~icons/tabler/check'
  import IconHelp from '~icons/tabler/help'
  import type { QuestionAnswerView, QuestionView } from '../agent-contracts.js'
  import { type AgentLocale, getAgentCopy } from '../agent-copy/index.js'

  const props = defineProps<{ question: QuestionView; locale: AgentLocale }>()
  const emit = defineEmits<{ answer: [answer: QuestionAnswerView]; cancel: [] }>()

  const selectedValues = ref<string[]>([])
  const note = ref('')
  /** 提交后立即禁用本卡片，避免连点重复投递；结算状态由父级事件覆盖。 */
  const submitted = ref(false)

  const text = computed(() => getAgentCopy(props.locale))
  /** 已取消的提问没有结算入口（pending 表里不存在），卡片只做只读回显。 */
  const settled = computed(() => props.question.status === 'cancelled')
  const canSubmit = computed(
    () => !submitted.value && (selectedValues.value.length > 0 || note.value.trim().length > 0),
  )

  /** 按 value 反查展示文本；value 不在当前选项中时回退为原值。 */
  const optionLabel = (value: string): string =>
    props.question.options.find((option) => option.value === value)?.label ?? value

  /** 已回答压成一行：Ask(已选择: … · 备注)。 */
  const summary = computed(() => {
    const answer = props.question.answer
    const chosen = (answer?.selectedValues ?? []).map(optionLabel).join(', ')
    const detail = [chosen ? `${text.value.question.chosen}: ${chosen}` : '', answer?.note ?? '']
      .filter(Boolean)
      .join(' · ')
    return detail ? `${text.value.question.label}(${detail})` : text.value.question.label
  })

  /** 判断选项是否已选。 */
  function isSelected(value: string): boolean {
    return selectedValues.value.includes(value)
  }

  /** 单选直接替换选中项并支持再次点击取消；多选切换命中项。 */
  function toggle(value: string): void {
    if (settled.value || submitted.value) return
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
    gap: var(--klc-space-8);
    padding: var(--klc-space-12, 12px);
    color: var(--klc-color-ui-text);
    /* 描边材质来自 .agent-bordered-surface：卡片底 + 1px 边框 + 表面圆角。 */
  }

  .question__prompt {
    display: flex;
    align-items: center;
    gap: var(--klc-space-8);
    margin: 0;
    overflow-wrap: anywhere;
    font-size: var(--klc-text-label-13-font-size, 13px);
  }
  .question__prompt > svg {
    flex: 0 0 auto;
    color: var(--klc-color-ui-accent);
  }

  .question__options {
    display: grid;
    gap: var(--klc-space-4);
  }
  /* 竖直平铺的选项行：没有独立卡片边框/底色，选择状态只由左侧标记承担。 */
  .question__option {
    min-width: 0;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: start;
    gap: var(--klc-space-2) var(--klc-space-8);
    padding-block: var(--klc-space-2);
    border: 0;
    background: transparent;
    color: var(--klc-color-ui-text);
    font: inherit;
    font-size: var(--klc-text-12-font-size, 12px);
    text-align: left;
    cursor: pointer;
  }
  .question__option > span {
    overflow-wrap: anywhere;
  }
  .question__option small {
    grid-column: 2;
    overflow-wrap: anywhere;
    color: var(--klc-color-ui-muted);
    font-size: var(--klc-text-12-font-size, 12px);
  }
  .question__option:hover:not(:disabled) .question__mark {
    border-color: var(--klc-color-ui-accent);
  }
  .question__option:disabled {
    cursor: default;
    opacity: 0.6;
  }

  /* 自绘选择控件：radio 圆点与 checkbox 对勾均用伪元素绘制，不渲染原生控件外观。 */
  .question__mark {
    flex: 0 0 auto;
    width: 14px;
    height: 14px;
    position: relative;
    margin-top: var(--klc-space-2);
    border: 1px solid var(--klc-color-ui-border-strong);
    background: var(--klc-color-ui-surface);
  }
  .question__option[role='radio'] .question__mark {
    border-radius: 50%;
  }
  .question__option[role='checkbox'] .question__mark {
    border-radius: var(--klc-radius-xs, 4px);
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

  .question__reply {
    display: flex;
    align-items: center;
    gap: var(--klc-space-8);
  }
  .question__reply input {
    min-width: 0;
    flex: 1 1 auto;
  }
  /* 提交就是一个图标本身：没有按钮容器、没有底色，只有图标和命中区。 */
  .question__submit {
    flex: 0 0 auto;
    width: 20px;
    height: 20px;
    color: var(--klc-color-ui-accent);
    cursor: pointer;
  }
  .question__submit.is-disabled {
    color: var(--klc-color-ui-muted);
    cursor: default;
  }
  .question__submit:focus-visible {
    outline: 2px solid var(--klc-color-ui-focus);
    outline-offset: 2px;
  }

  /* 结算后的一行状态：图标 + 结果，长文本省略并靠 title 提供全文。 */
  .question-summary {
    display: flex;
    align-items: center;
    gap: var(--agent-inline-gap, var(--klc-space-8));
    min-width: 0;
    color: var(--klc-color-ui-muted);
    font-size: var(--klc-text-12-font-size, 12px);
  }
  .question-summary > svg {
    flex: 0 0 auto;
    width: var(--agent-inline-icon, 16px);
    height: var(--agent-inline-icon, 16px);
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
