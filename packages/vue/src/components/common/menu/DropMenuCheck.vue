<!-- 菜单项行尾勾选标记：主列表的行尾座位与二级菜单共用同一份渲染。 -->
<template>
  <span v-if="checked !== undefined" class="drop-menu__check" aria-hidden="true">
    <IconTablerCheck v-if="checked" />
  </span>
</template>

<script setup lang="ts">
  import './drop-menu-item.css'
  import IconTablerCheck from '~icons/tabler/check'

  defineProps<{
    /** 勾选状态；undefined 表示该行没有选中语义，不渲染槽位。 */
    checked?: boolean
  }>()
</script>
