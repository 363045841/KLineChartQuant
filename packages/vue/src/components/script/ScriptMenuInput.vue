<!-- 脚本菜单的命名输入：挂载即聚焦并全选，Enter 提交，错误留在输入下方。 -->
<template>
  <form class="script-menu__form" @submit.prevent="submit">
    <input
      v-model="value"
      v-auto-focus="'select'"
      class="klc-script-input"
      :aria-label="label"
      autocomplete="off"
      spellcheck="false"
      :disabled="running"
      @keydown.enter="onEnter"
    />
    <div v-if="error" class="klc-script-menu-status is-error" role="status">{{ error }}</div>
  </form>
</template>

<script setup lang="ts">
  import { vAutoFocus } from '@vue-src/utils/autoFocus.js'
  import { ref } from 'vue'

  const props = defineProps<{
    label: string
    value: string
    error: string | null
    running: boolean
  }>()
  const emit = defineEmits<{ submit: [value: string] }>()

  const value = ref(props.value)

  /** 提交前去掉首尾空白；输入法组合中的确认键不提交。 */
  function submit(): void {
    if (props.running) return
    emit('submit', value.value)
  }

  /** Enter 显式提交，避免依赖不同浏览器对表单隐式提交的差异。 */
  function onEnter(event: KeyboardEvent): void {
    if (event.isComposing) return
    event.preventDefault()
    submit()
  }
</script>
