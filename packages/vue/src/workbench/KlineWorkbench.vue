<!-- 单一产品入口：立即挂载界面，脚本与 Agent 独立异步加载。 -->
<template>
  <div class="kline-workbench" :data-theme="theme">
    <slot v-if="failure" name="error" :error="failure">
      <p role="alert">{{ failure.message }}</p>
    </slot>
    <WorkbenchContent
      v-else
      ref="content"
      v-bind="{ ...$props, ...$attrs }"
      @controller-ready="emit('controller-ready', $event)"
      @theme-change="onThemeChange"
      @update:is-fullscreen="emit('update:is-fullscreen', $event)"
      @error="emit('error', $event)"
    />
  </div>
</template>

<script setup lang="ts">
  import type { ChartController } from '@363045841yyt/klinechart-core/controllers'
  import { onErrorCaptured, shallowRef } from 'vue'
  import type { KlineWorkbenchHandle, KlineWorkbenchProps } from './types.js'
  import WorkbenchContent from './impl/WorkbenchContent.vue'

  defineOptions({ inheritAttrs: false })
  withDefaults(defineProps<KlineWorkbenchProps>(), {
    agent: true,
    scripts: true,
    initialAgentPanelOpen: true,
  })
  const emit = defineEmits<{
    'controller-ready': [controller: ChartController]
    'theme-change': [theme: 'light' | 'dark']
    'update:is-fullscreen': [fullscreen: boolean]
    error: [error: Error]
  }>()
  const content = shallowRef<KlineWorkbenchHandle | null>(null)
  const failure = shallowRef<Error | null>(null)
  const theme = shallowRef<'light' | 'dark'>('light')
  onErrorCaptured((error) => {
    failure.value = error
    emit('error', error)
    return false
  })
  /** 工作台外壳跟随图表的有效主题，与源码预览保持一致。 */
  function onThemeChange(value: 'light' | 'dark'): void {
    theme.value = value
    emit('theme-change', value)
  }
  defineExpose({ getController: () => content.value?.getController() ?? null })
</script>

<style>
  .kline-workbench { width: 100%; height: 100%; min-width: 0; min-height: 0; }
</style>
