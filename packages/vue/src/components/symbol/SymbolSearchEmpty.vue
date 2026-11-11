<!-- 商品搜索空状态：无结果与请求失败共用同一图标与文案布局。 -->
<template>
  <div :class="emptyClass">
    <svg
      width="32"
      height="32"
      viewBox="0 0 32 32"
      fill="none"
      style="margin-bottom: 8px; opacity: 0.35"
    >
      <circle cx="13" cy="13" r="10" stroke="currentColor" stroke-width="2" />
      <line
        x1="21"
        y1="21"
        x2="29"
        y2="29"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
      />
    </svg>
    <span>{{ error ? '搜索失败' : '未找到相关商品' }}</span>
  </div>
</template>

<script setup lang="ts">
  import '../common/symbol-list.css'

  withDefaults(
    defineProps<{
      error?: boolean
      /** 保留调用方的列表空状态类名，复用现有 scoped 样式。 */
      emptyClass?: string
    }>(),
    { error: false, emptyClass: 'symbol-list__empty' },
  )
</script>

