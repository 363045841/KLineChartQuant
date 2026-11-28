<!--
  弹窗列表空态：统一搜索图标、标题与搜索提示。
  只承载展示，不判断分区或业务过滤原因。
-->
<template>
  <BaseEmptyState class="modal-list-item" role="status">
    <template v-if="searchEmpty" #icon><IconTablerSearch /></template>
    {{ title }}
    <template v-if="searchEmpty" #hint>请尝试其他关键词</template>
  </BaseEmptyState>
</template>

<script setup lang="ts">
  import BaseEmptyState from '@vue-src/components/common/feedback/BaseEmptyState.vue'
  import IconTablerSearch from '~icons/tabler/search'

  defineProps<{
    /** 空态标题；由调用方按分区与搜索状态决定。 */
    title: string
    /** 是否处于搜索过滤状态；为真时显示搜索图标与提示。 */
    searchEmpty: boolean
  }>()
</script>
