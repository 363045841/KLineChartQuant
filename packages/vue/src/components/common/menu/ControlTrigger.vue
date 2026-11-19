<!-- 工具栏文字触发器，键盘、禁用和事件使用原生按钮语义。 -->
<template>
  <button
    type="button"
    class="control-button"
    :aria-label="label"
  >
    <slot>{{ label }}</slot>
  </button>
</template>

<script setup lang="ts">
  import './control-button.css'

  defineProps<{ label: string }>()
</script>
