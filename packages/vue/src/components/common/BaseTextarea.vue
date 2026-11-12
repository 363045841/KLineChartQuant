<!--
  共享多行输入：按内容自增高，没有原生拖拽手柄。
  - 支持 `field-sizing: content`（Baseline 2026）时完全由 CSS 处理；
  - 不支持时用 JS 兜底：输入后按 scrollHeight 设置高度；
  - 最小/最大高度用行数表示（基于 1lh），超过最大高度后内部滚动。
  其余属性（placeholder、spellcheck、aria-*、事件）透传到 <textarea>。
-->
<template>
  <textarea
    ref="field"
    v-model="model"
    class="base-textarea"
    :class="[
      `base-textarea--${size}`,
      `base-textarea--${variant}`,
      { 'base-textarea--js-autosize': !nativeSizing },
    ]"
    :rows="minRows"
    :style="sizeVars"
    @input="resize"
  />
</template>

<script setup lang="ts">
  import { supportsFieldSizing } from '@vue-src/composables/overlay/platform.js'
  import { computed, nextTick, onMounted, useTemplateRef, watch } from 'vue'

  const props = withDefaults(
    defineProps<{
      /** 最少显示行数。 */
      minRows?: number
      /** 最多显示行数；超过后内部滚动。 */
      maxRows?: number
      /** 外观变体：default 为四周描边，underline 只保留下边线。 */
      variant?: 'default' | 'underline'
      size?: 'sm' | 'md'
    }>(),
    { minRows: 2, maxRows: 8, variant: 'default', size: 'md' },
  )

  const model = defineModel<string>({ default: '' })

  const field = useTemplateRef<HTMLTextAreaElement>('field')
  const nativeSizing = supportsFieldSizing()

  const sizeVars = computed(() => ({
    '--base-textarea-min-rows': String(props.minRows),
    '--base-textarea-max-rows': String(props.maxRows),
  }))

  /** JS 兜底：高度跟随内容，并受 CSS 的 min/max-block-size 约束。 */
  function resize(): void {
    const element = field.value
    if (nativeSizing || !element) return
    element.style.height = 'auto'
    element.style.height = `${element.scrollHeight}px`
  }

  watch(model, () => void nextTick(resize))
  watch(
    () => [props.minRows, props.maxRows],
    () => void nextTick(resize),
  )
  onMounted(resize)

  defineExpose({
    focus: () => field.value?.focus(),
    select: () => field.value?.select(),
    el: field,
  })
</script>

<style scoped>
  /* 默认外观保持无层：宿主 reset 必须是零特异性 :where()，组件类才能压过它；不要改回 @layer。 */
  .base-textarea {
    --base-textarea-padding-block: var(--klc-space-8, 8px);
    --base-textarea-border: 1px;

    display: block;
    box-sizing: border-box;
    width: 100%;
    field-sizing: content;
    resize: none;
    min-block-size: calc(
      var(--base-textarea-min-rows) * 1lh + 2 * var(--base-textarea-padding-block) + 2 *
        var(--base-textarea-border)
    );
    max-block-size: calc(
      var(--base-textarea-max-rows) * 1lh + 2 * var(--base-textarea-padding-block) + 2 *
        var(--base-textarea-border)
    );
    overflow-y: auto;
    padding: var(--base-textarea-padding-block) var(--klc-space-12, 12px);
    border: var(--base-textarea-border) solid var(--klc-color-ui-border);
    border-radius: var(--klc-radius-sm, 6px);
    background: var(--klc-color-ui-input, transparent);
    color: var(--klc-color-ui-text);
    font: inherit;
    font-size: var(--klc-text-copy-13-font-size, 13px);
    line-height: var(--klc-text-copy-13-line-height, 18px);
    /* 聚焦不画边框或焦点环，光标即提示。 */
    outline: none;
  }

  .base-textarea--sm {
    --base-textarea-padding-block: var(--klc-space-4, 4px);

    padding-inline: var(--klc-space-8, 8px);
    font-size: var(--klc-text-12-font-size, 12px);
    line-height: var(--klc-text-12-line-height, 16px);
  }

  /* 下划线变体：嵌在设置卡片/连接表单里，只提亮底线，不画四周框。 */
  .base-textarea--underline {
    --base-textarea-border: 0;

    padding-inline: var(--klc-space-2, 2px);
    border-bottom: 1px solid var(--klc-color-ui-border);
    border-radius: 0;
    background: transparent;
    transition: border-color var(--klc-motion-dur-fast) var(--klc-motion-ease-out);
  }

  .base-textarea--underline:focus {
    border-bottom-color: var(--klc-color-ui-border-strong);
  }

  .base-textarea::placeholder {
    color: var(--klc-color-ui-muted);
  }

  .base-textarea:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>
