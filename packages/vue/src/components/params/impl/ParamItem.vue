<!-- 参数单行：标签、取值范围与按类型渲染的控件；指标与警报共用。 -->
<template>
  <div class="param-item">
    <FormRow :for-id="controlId">
      <template #label>
        <span class="param-label-text">{{ param.label }}</span>
        <span v-if="hasRange" class="param-range">{{ rangeText }}</span>
      </template>
      <DropMenu
        v-if="param.type === 'select'"
        :label="param.label"
        :groups="optionGroups"
        trigger-variant="field"
        :trigger-id="controlId"
        @select="onSelect"
      >
        <template #trigger>
          <span class="selection-menu__value">{{ optionLabel }}</span>
          <IconChevronDown class="selection-menu__chevron" aria-hidden="true" />
        </template>
      </DropMenu>
      <input
        v-else-if="param.type === 'boolean'"
        :id="controlId"
        type="checkbox"
        :checked="value === true"
        @change="onChecked"
      />
      <input
        v-else-if="param.type === 'string'"
        :id="controlId"
        type="text"
        class="param-input"
        :value="value"
        @input="onText"
      />
      <div v-else class="input-wrapper">
        <button
          type="button"
          class="stepper-btn"
          aria-label="减少"
          :disabled="param.min !== undefined && numberValue <= param.min"
          @click="step(-1)"
        >
          <IconTablerMinus aria-hidden="true" />
        </button>
        <input
          :id="controlId"
          type="number"
          class="param-input"
          :value="value"
          :min="param.min"
          :max="param.max"
          :step="param.step || 1"
          @input="onNumberInput"
        />
        <button
          type="button"
          class="stepper-btn"
          aria-label="增加"
          :disabled="param.max !== undefined && numberValue >= param.max"
          @click="step(1)"
        >
          <IconTablerPlus aria-hidden="true" />
        </button>
      </div>
    </FormRow>
  </div>
</template>

<script setup lang="ts">
  import '@vue-src/components/common/menu/selection-menu.css'
  import '@vue-src/components/common/form/stepper-button.css'

  import FormRow from '@vue-src/components/common/form/FormRow.vue'
  import DropMenu, { type DropMenuGroup } from '@vue-src/components/common/menu/DropMenu.vue'
  import { computed, useId } from 'vue'
  import IconChevronDown from '~icons/tabler/chevron-down'
  import IconTablerMinus from '~icons/tabler/minus'
  import IconTablerPlus from '~icons/tabler/plus'
  import type { ParamItemProps } from '../types.js'

  const props = defineProps<ParamItemProps>()

  const emit = defineEmits<{ update: [value: number | string | boolean] }>()

  /** 可见标签与控件关联的唯一 id；select 通过 DropMenu 的 triggerId 落到触发按钮上。 */
  const controlId = useId()

  /** 数字参数当前值；非数字或缺失时按 0 处理。 */
  const numberValue = computed(() => (typeof props.value === 'number' ? props.value : 0))
  const hasRange = computed(() => props.param.min !== undefined || props.param.max !== undefined)
  const rangeText = computed(() => `${props.param.min ?? '-∞'} ~ ${props.param.max ?? '+∞'}`)

  /** 选项参数映射为 DropMenu 分组；参数名已显示在行首，菜单不再重复分组标题。 */
  const optionGroups = computed<DropMenuGroup[]>(() => [
    {
      id: props.param.key,
      label: '',
      items: (props.param.options ?? []).map((option) => ({
        id: option.value,
        label: option.label,
        checked: option.value === props.value,
        selection: 'radio',
      })),
    },
  ])

  /** 当前选项的显示名称。 */
  const optionLabel = computed(
    () => props.param.options?.find((option) => option.value === props.value)?.label ?? '',
  )

  /** 写入菜单选择的选项值。 */
  function onSelect(_groupId: string, itemId: string): void {
    emit('update', itemId)
  }

  /** 布尔参数保留原始类型，避免传入脚本时变成字符串。 */
  function onChecked(event: Event): void {
    if (!(event.target instanceof HTMLInputElement)) return
    emit('update', event.target.checked)
  }

  /** 文本参数保留原始类型。 */
  function onText(event: Event): void {
    if (!(event.target instanceof HTMLInputElement)) return
    emit('update', event.target.value)
  }

  /** 从原生数字输入更新草稿，忽略非法输入。 */
  function onNumberInput(event: Event): void {
    if (!(event.target instanceof HTMLInputElement)) return
    const parsed = Number.parseFloat(event.target.value)
    if (!Number.isNaN(parsed)) emit('update', parsed)
  }

  /** 在 min/max 范围内按 step 增减数字参数。 */
  function step(direction: 1 | -1): void {
    let next = numberValue.value + direction * (props.param.step || 1)
    if (props.param.min !== undefined) next = Math.max(props.param.min, next)
    if (props.param.max !== undefined) next = Math.min(props.param.max, next)
    emit('update', Number.parseFloat(next.toFixed(10)))
  }
</script>

<style scoped>
  /* ── 参数行：统一控件尺寸供本组件与下方两个外部 css 共用 ── */
  .param-item {
    --param-control-height: var(--klc-density-default, 32px);
    --param-control-radius: var(--klc-radius-sm, 6px);

    padding-block: 10px;
    /* 弹窗正文贴边，参数行自己消费横向 inset。 */
    padding-inline: var(--base-modal-content-inset);
  }

  .param-item + .param-item {
    border-top: 1px solid color-mix(in srgb, var(--klc-color-ui-border) 50%, transparent);
  }

  .param-label-text {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .param-range {
    flex: none;
    font-size: var(--klc-text-11-font-size, 11px);
    line-height: var(--klc-text-11-line-height, 16px);
    font-variant-numeric: tabular-nums;
    color: var(--klc-color-ui-text-soft);
  }

  /* ── 步进输入框：[-] 20 [+] 作为一个整体 ── */
  .input-wrapper {
    display: inline-flex;
    flex: none;
    align-items: stretch;
    height: var(--param-control-height);
    border: 1px solid var(--klc-color-ui-border);
    border-radius: var(--param-control-radius);
    overflow: hidden;
    background: var(--klc-color-ui-input-background);
  }

  .input-wrapper .stepper-btn {
    width: var(--param-control-height);
    height: 100%;
    flex: none;
  }

  .param-input {
    box-sizing: border-box;
    width: 56px;
    min-width: 0;
    height: 100%;
    padding: 0 6px;
    border: 0;
    font-size: var(--klc-text-13-font-size, 13px);
    font-variant-numeric: tabular-nums;
    text-align: center;
    color: var(--klc-color-ui-text);
    background: transparent;
    -moz-appearance: textfield;
    appearance: textfield;
  }

  .param-input::-webkit-inner-spin-button,
  .param-input::-webkit-outer-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  .param-input:focus {
    outline: none;
  }

  /* 文本类参数：独立输入框，不在步进器里 */
  input[type='text'].param-input {
    width: 140px;
    height: var(--param-control-height);
    padding: 0 10px;
    border: 1px solid var(--klc-color-ui-border);
    border-radius: var(--param-control-radius);
    text-align: left;
    background: var(--klc-color-ui-input-background);
    /* 聚焦不画边框或焦点环，光标即提示。 */
    outline: none;
  }

  /* 布尔参数 */
  input[type='checkbox'] {
    width: 16px;
    height: 16px;
    margin: 0;
    accent-color: var(--klc-color-ui-accent);
    cursor: pointer;
  }

</style>
