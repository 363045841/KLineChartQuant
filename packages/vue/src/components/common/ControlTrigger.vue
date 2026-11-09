<!-- 工具栏共用触发器：默认整按钮点击，split 模式允许主操作与下拉箭头分别点击。 -->
<template>
  <div
    v-if="split"
    class="control-button drop-menu__trigger control-trigger"
    role="group"
    :aria-label="label"
  >
    <button
      type="button"
      class="control-trigger__action"
      :aria-label="label"
      :disabled="disabled"
      @click="emit('click', $event)"
    >
      <slot>{{ label }}</slot>
    </button>
    <button
      ref="element"
      v-bind="$attrs"
      type="button"
      class="control-trigger__action control-trigger__dropdown"
      :aria-label="dropdownLabel"
      :disabled="disabled || dropdownDisabled"
      @click="emit('dropdownClick', $event)"
    >
      <IconChevronDown class="control-trigger__chevron" aria-hidden="true" />
    </button>
  </div>
  <button
    v-else
    ref="element"
    v-bind="$attrs"
    type="button"
    class="control-button drop-menu__trigger"
    :aria-label="label"
    :disabled="disabled"
    @click="emit('click', $event)"
  >
    <slot>{{ label }}</slot>
  </button>
</template>

<script setup lang="ts">
  import { useTemplateRef } from 'vue'
  import IconChevronDown from '~icons/tabler/chevron-down'

  defineOptions({ inheritAttrs: false })
  defineProps<{
    label: string
    split?: boolean
    dropdownLabel?: string
    disabled?: boolean
    dropdownDisabled?: boolean
  }>()
  const emit = defineEmits<{
    click: [event: MouseEvent]
    dropdownClick: [event: MouseEvent]
  }>()
  const element = useTemplateRef<HTMLButtonElement>('element')

  /** 弹层关闭后把焦点还给实际打开弹层的按钮。 */
  function focus(): void {
    element.value?.focus()
  }

  defineExpose({ element, focus })
</script>

<style scoped src="./control-button.css"></style>
<style scoped>
  .control-button.control-trigger {
    padding: 0;
    gap: 0;
  }

  /* 外观由整体触发器承担，内部按钮仅提供各自的点击与键盘操作区域。 */
  .control-trigger__action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    align-self: stretch;
    gap: var(--control-button-content-gap);
    padding: 0 var(--control-button-inline-padding);
    border: 0;
    border-radius: inherit;
    background: transparent;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }

  .control-trigger__dropdown {
    /* margin 隔开两块 hover；箭头两侧对称留白，避免高亮紧贴图标或文字。 */
    margin-inline-start: var(--control-button-content-gap);
    padding: 0 calc(var(--control-button-inline-padding) / 2);
  }

  .control-trigger__action:focus-visible {
    outline: 0;
  }

  .control-trigger__action:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .control-trigger__chevron {
    width: 14px;
    height: 14px;
    color: var(--klc-color-ui-muted);
    transition: transform var(--klc-motion-duration-fast) ease;
  }

  .control-trigger__dropdown[aria-expanded='true'] .control-trigger__chevron {
    transform: rotate(180deg);
  }
</style>
