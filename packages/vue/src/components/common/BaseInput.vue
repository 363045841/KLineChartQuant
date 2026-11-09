<!--
  共享单行输入框：统一 v-model、尺寸与 form-control 外观。
  - default：四边边框输入框；
  - underline：只保留底边线，聚焦时提亮底线；
  - inline：行内命名输入框，尺寸由所在布局决定。
  原生 input 属性（id、maxlength、autocomplete、disabled、aria-*、事件）全部透传。
-->
<template>
  <input
    ref="field"
    v-model="model"
    :class="{
      'form-control': variant !== 'inline',
      'form-control--underline': variant === 'underline',
      'form-control-inline-name': variant === 'inline',
    }"
    :type="type"
  />
</template>

<script setup lang="ts">
  import { useTemplateRef } from 'vue'

  withDefaults(
    defineProps<{
      /** 外观变体：default 为四边框；underline 只保留底边线；inline 为行内命名控件。 */
      variant?: 'default' | 'underline' | 'inline'
      /** 原生输入类型。 */
      type?: string
    }>(),
    { variant: 'default', type: 'text' },
  )

  const model = defineModel<string>({ default: '' })
  const field = useTemplateRef<HTMLInputElement>('field')

  defineExpose({
    /** 聚焦内部输入框。 */
    focus: () => field.value?.focus(),
    /** 全选内部输入框文本。 */
    select: () => field.value?.select(),
    /** 原生 input 元素，供调用方读取选择范围等。 */
    el: field,
  })
</script>

<style scoped src="./form-control.css"></style>
