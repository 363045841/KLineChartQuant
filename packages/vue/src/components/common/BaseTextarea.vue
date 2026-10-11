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
    :class="[`base-textarea--${size}`, { 'base-textarea--js-autosize': !nativeSizing }]"
    :rows="minRows"
    :style="sizeVars"
    @input="resize"
  />
</template>

<script setup lang="ts">
  import { computed, nextTick, onMounted, useTemplateRef, watch } from 'vue'

  import { supportsFieldSizing } from '../../composables/overlay/platform.js'

  const props = withDefaults(
    defineProps<{
      /** 最少显示行数。 */
      minRows?: number
      /** 最多显示行数；超过后内部滚动。 */
      maxRows?: number
      size?: 'sm' | 'md'
    }>(),
    { minRows: 2, maxRows: 8, size: 'md' },
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
    transition:
      border-color var(--klc-motion-dur-fast, 160ms) var(--klc-motion-ease-out, ease-out),
      box-shadow var(--klc-motion-dur-fast, 160ms) var(--klc-motion-ease-out, ease-out);
  }

  .base-textarea--sm {
    --base-textarea-padding-block: var(--klc-space-4, 4px);

    padding-inline: var(--klc-space-8, 8px);
    font-size: var(--klc-text-12-font-size, 12px);
    line-height: var(--klc-text-12-line-height, 16px);
  }

  .base-textarea::placeholder {
    color: var(--klc-color-ui-muted);
  }

  .base-textarea:focus-visible {
    border-color: var(--klc-color-ui-accent);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--klc-color-ui-accent) 24%, transparent);
    outline: 0;
  }

  .base-textarea:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  @media (prefers-reduced-motion: reduce) {
    .base-textarea {
      transition: none;
    }
  }
</style>
