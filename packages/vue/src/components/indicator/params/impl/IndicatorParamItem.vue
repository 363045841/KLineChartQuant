<!-- 指标参数单行：标签、取值范围、按类型渲染的控件与说明。 -->
<template>
  <div class="param-item">
    <div class="param-header">
      <label class="param-label">
        <span class="param-label-text">{{ param.label }}</span>
        <span v-if="hasRange" class="param-range">{{ rangeText }}</span>
      </label>
      <DropMenu
        v-if="param.type === 'select'"
        :label="param.label"
        :groups="optionGroups"
        density="compact"
        @select="onSelect"
      >
        <template #trigger>
          <span class="selection-menu__value">{{ optionLabel }}</span>
          <IconChevronDown class="selection-menu__chevron" aria-hidden="true" />
        </template>
        <template #item-action="{ item }">
          <span v-if="isOptionSelected(item.id)" class="drop-menu__status">
            <IconTablerCheck aria-hidden="true" />
          </span>
        </template>
      </DropMenu>
      <div v-else-if="param.type === 'color'" class="color-field">
        <button
          type="button"
          class="color-swatch"
          :class="{ 'is-theme': colorValue === '' }"
          :style="colorValue === '' ? undefined : { backgroundColor: colorValue }"
          :aria-label="param.label"
          @click="openColorPicker"
        >
          <span v-if="colorValue === ''">主题</span>
        </button>
        <button
          v-if="colorValue !== ''"
          type="button"
          class="color-reset"
          aria-label="恢复主题配色"
          @click="emit('update', '')"
        >
          <IconTablerX aria-hidden="true" />
        </button>
        <input
          ref="colorPicker"
          type="color"
          class="color-picker"
          tabindex="-1"
          aria-hidden="true"
          :value="colorValue === '' ? THEME_PLACEHOLDER_COLOR : colorValue"
          @input="onColorInput"
        />
      </div>
      <input
        v-else-if="param.type === 'boolean'"
        type="checkbox"
        :aria-label="param.label"
        :checked="value === true"
        @change="onChecked"
      />
      <input
        v-else-if="param.type === 'string'"
        type="text"
        class="param-input"
        :aria-label="param.label"
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
    </div>

    <!-- 始终渲染，用 grid 行高过渡展开/收起，避免 margin 跳变 -->
    <div
      v-if="param.description"
      class="param-description"
      :class="{ 'is-open': showDescription }"
      :aria-hidden="!showDescription"
    >
      <div class="param-description__clip">
        <p class="param-description__text">{{ param.description }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import DropMenu, { type DropMenuGroup } from '@vue-src/components/common/DropMenu.vue'
  import { computed, ref } from 'vue'
  import IconTablerCheck from '~icons/tabler/check'
  import IconChevronDown from '~icons/tabler/chevron-down'
  import IconTablerMinus from '~icons/tabler/minus'
  import IconTablerPlus from '~icons/tabler/plus'
  import IconTablerX from '~icons/tabler/x'
  import type { IndicatorParamItemProps } from '../types.js'

  const props = defineProps<IndicatorParamItemProps>()

  const emit = defineEmits<{ update: [value: number | string | boolean] }>()

  /** 取色器在「跟随主题」时需要一个具体值，否则浏览器会显示初始黑。 */
  const THEME_PLACEHOLDER_COLOR = '#000000'

  /** 颜色参数当前值；非字符串一律按「跟随主题」处理。 */
  const colorValue = computed(() => (typeof props.value === 'string' ? props.value : ''))
  const colorPicker = ref<HTMLInputElement | null>(null)

  /** 原生取色器不可直接美化，用色块按钮代为触发。 */
  function openColorPicker(): void {
    colorPicker.value?.click()
  }

  /** 取色器只产出六位十六进制，直接写入草稿。 */
  function onColorInput(event: Event): void {
    if (!(event.target instanceof HTMLInputElement)) return
    emit('update', event.target.value)
  }

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
      })),
    },
  ])

  /** 当前选项的显示名称。 */
  const optionLabel = computed(
    () => props.param.options?.find((option) => option.value === props.value)?.label ?? '',
  )

  /** 选项是否处于选中态。 */
  function isOptionSelected(optionValue: string): boolean {
    return props.value === optionValue
  }

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
    --param-control-height: 32px;
    --param-control-radius: 8px;

    padding: 10px 4px;
    border-radius: 10px;
  }

  .param-item + .param-item {
    border-top: 1px solid color-mix(in srgb, var(--klc-color-ui-border) 50%, transparent);
  }

  .param-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    min-height: var(--param-control-height);
  }

  .param-label {
    display: flex;
    flex-direction: row;
    align-items: baseline;
    gap: 6px;
    min-width: 0;
    padding-inline-start: 4px;
  }

  .param-label-text {
    font-size: 14px;
    font-weight: 600;
    line-height: 1.2;
    color: var(--klc-color-ui-text);
  }

  .param-range {
    font-size: 11px;
    line-height: 1.2;
    font-variant-numeric: tabular-nums;
    color: var(--klc-color-ui-muted);
    opacity: 0.8;
  }

  /* ── 参数描述：作为所属控件的次级提示，紧贴上方、与标签左对齐 ── */
  .param-description {
    display: grid;
    grid-template-rows: 0fr;
    opacity: 0;
    visibility: hidden;
    transition:
      grid-template-rows 0.2s ease,
      opacity 0.2s ease,
      visibility 0s linear 0.2s;
  }

  .param-description.is-open {
    grid-template-rows: 1fr;
    opacity: 1;
    visibility: visible;
    transition-delay: 0s;
  }

  .param-description__clip {
    min-height: 0;
    overflow: hidden;
  }

  .param-description__text {
    margin: 0;
    padding: 6px 4px 2px;
    font-size: 12px;
    line-height: 1.55;
    color: var(--klc-color-ui-muted);
    text-wrap: pretty;
  }

  /* ── 步进输入框：[-] 20 [+] 作为一个整体 ── */
  .input-wrapper {
    display: inline-flex;
    align-items: stretch;
    height: var(--param-control-height);
    border: 1px solid var(--klc-color-ui-border);
    border-radius: var(--param-control-radius);
    overflow: hidden;
    background: var(--klc-color-ui-control-background);
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
    font-size: 14px;
    font-weight: 600;
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
    font-weight: 500;
    background: var(--klc-color-ui-control-background);
    /* 聚焦不画边框或焦点环，光标即提示。 */
    outline: none;
  }

  /* 布尔参数 */
  input[type='checkbox'] {
    width: 18px;
    height: 18px;
    margin: 0;
    accent-color: var(--klc-color-ui-accent);
    cursor: pointer;
  }

  /* ── 颜色参数：色块 + 恢复按钮，原生取色器隐藏后由色块触发 ── */
  .color-field {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .color-swatch {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 56px;
    height: var(--param-control-height);
    padding: 0;
    border: 1px solid var(--klc-color-ui-border);
    border-radius: var(--param-control-radius);
    font-size: 12px;
    color: var(--klc-color-ui-muted);
    cursor: pointer;
  }

  /* 空值态用斜纹表示「跟随主题」，避免与纯白或纯黑混淆 */
  .color-swatch.is-theme {
    background-image: repeating-linear-gradient(
      45deg,
      transparent 0 4px,
      color-mix(in srgb, var(--klc-color-ui-border) 70%, transparent) 4px 8px
    );
  }

  .color-swatch:focus-visible,
  .color-reset:focus-visible {
    outline: 2px solid var(--klc-color-ui-accent);
    outline-offset: 1px;
  }

  .color-reset {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    padding: 0;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--klc-color-ui-muted);
    cursor: pointer;
  }

  .color-reset:hover {
    background: var(--klc-color-ui-control-background);
    color: var(--klc-color-ui-text);
  }

  .color-reset svg {
    width: 14px;
    height: 14px;
  }

  /* 原生取色器只作为系统弹窗入口，不参与布局 */
  .color-picker {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
    pointer-events: none;
  }

  @media (prefers-reduced-motion: reduce) {
    .param-description,
    .input-wrapper {
      transition: none;
    }
  }
</style>

<style scoped src="../../../common/selection-menu.css"></style>
<style scoped src="../../../common/stepper-button.css"></style>
