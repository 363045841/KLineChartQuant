<!--
  开关交互壳：原生 checkbox 提供状态、键盘和表单语义，视觉交给 ToggleSwitchTrack。
  菜单等不能放 input 的场景直接消费 Track，由容器自己提供 menuitemcheckbox 语义。
-->
<template>
  <label class="toggle-switch" :class="{ 'is-disabled': disabled }">
    <input
      type="checkbox"
      v-model="model"
      :disabled="disabled"
      :aria-label="label"
    />
    <ToggleSwitchTrack :checked="model" :size="size" />
  </label>
</template>

<script setup lang="ts">
  import ToggleSwitchTrack from './ToggleSwitchTrack.vue'

  defineProps<{
    disabled?: boolean
    label: string
    size?: 'default' | 'compact'
  }>()

  const model = defineModel<boolean>({ required: true })
</script>

<style scoped>
  .toggle-switch {
    position: relative;
    display: inline-flex;
    flex: 0 0 auto;
    margin: 0;
    cursor: pointer;
  }

  .toggle-switch.is-disabled {
    cursor: default;
    opacity: 0.55;
  }

  .toggle-switch input {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    margin: 0;
    opacity: 0;
    cursor: inherit;
  }

  .toggle-switch:has(input:focus-visible) {
    outline: 2px solid var(--toggle-switch-focus-color, var(--klc-color-ui-focus));
    outline-offset: 2px;
    border-radius: var(--klc-radius-full, 9999px);
  }
</style>
