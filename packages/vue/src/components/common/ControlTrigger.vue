<!-- 工具栏共用触发器：单按钮承载标签、禁用态与焦点归还，弹层展开交给调用方的 popover 绑定。 -->
<template>
  <button
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
  import './control-button.css'

  import { useTemplateRef } from 'vue'

  defineOptions({ inheritAttrs: false })
  defineProps<{
    label: string
    disabled?: boolean
  }>()
  const emit = defineEmits<{
    click: [event: MouseEvent]
  }>()
  const element = useTemplateRef<HTMLButtonElement>('element')

  /** 弹层关闭后把焦点还给实际打开弹层的按钮。 */
  function focus(): void {
    element.value?.focus()
  }

  defineExpose({ element, focus })
</script>

