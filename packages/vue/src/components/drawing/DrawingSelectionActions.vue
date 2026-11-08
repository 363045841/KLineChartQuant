<!-- 选中图元动作组：复制、克隆、隐藏、锁定与删除；由父级决定是否展示。 -->
<template>
  <BaseTooltip content="复制" command="drawing.copy" placement="top" trigger-display="contents">
    <button
      type="button"
      class="toolbar-btn toolbar-btn--copy"
      aria-label="复制所选图元"
      @click="emit('copy')"
    >
      <IconTablerCopy class="lock-icon" aria-hidden="true" />
    </button>
  </BaseTooltip>

  <BaseTooltip content="克隆" placement="top" trigger-display="contents">
    <button
      type="button"
      class="toolbar-btn toolbar-btn--clone"
      aria-label="克隆所选图元"
      @click="emit('clone')"
    >
      <IconTablerCopyPlus class="lock-icon" aria-hidden="true" />
    </button>
  </BaseTooltip>

  <BaseTooltip content="隐藏所选图元" placement="top" trigger-display="contents">
    <button
      type="button"
      class="toolbar-btn toolbar-btn--visibility"
      aria-label="隐藏所选图元"
      @click="emit('hide')"
    >
      <IconTablerEyeOff class="lock-icon" aria-hidden="true" />
    </button>
  </BaseTooltip>

  <BaseTooltip :content="allLocked ? '解锁' : '锁定'" placement="top" trigger-display="contents">
    <button
      type="button"
      class="toolbar-btn toolbar-btn--lock"
      :class="{ 'is-locked': allLocked }"
      :aria-label="allLocked ? '解锁' : '锁定'"
      @click="emit('toggleLock', !allLocked)"
    >
      <IconTablerLock v-if="allLocked" class="lock-icon" aria-hidden="true" />
      <IconTablerLockOpen v-else class="lock-icon" aria-hidden="true" />
    </button>
  </BaseTooltip>

  <!-- 锁定只冻结几何拖动与删除；样式等编辑照常可用。 -->
  <BaseTooltip content="删除" placement="top" trigger-display="contents">
    <button
      type="button"
      class="toolbar-btn toolbar-btn--delete"
      aria-label="删除"
      :disabled="allLocked"
      @click="emit('delete')"
    >
      <DeleteIcon />
    </button>
  </BaseTooltip>
</template>

<script setup lang="ts">
  import type { DrawingObject } from '@363045841yyt/klinechart-core/controllers'
  import BaseTooltip from '@vue-src/components/common/BaseTooltip.vue'
  import DeleteIcon from '@vue-src/components/common/DeleteIcon.vue'
  import { computed } from 'vue'
  import IconTablerCopy from '~icons/tabler/copy'
  import IconTablerCopyPlus from '~icons/tabler/copy-plus'
  import IconTablerEyeOff from '~icons/tabler/eye-off'
  import IconTablerLock from '~icons/tabler/lock'
  import IconTablerLockOpen from '~icons/tabler/lock-open'

  const props = defineProps<{ drawings: ReadonlyArray<DrawingObject> }>()

  const emit = defineEmits<{
    (e: 'copy'): void
    (e: 'clone'): void
    (e: 'hide'): void
    (e: 'toggleLock', locked: boolean): void
    (e: 'delete'): void
  }>()

  /** 全部选中图元均已锁定；混合选中视为未完全锁定。 */
  const allLocked = computed(
    () => props.drawings.length > 0 && props.drawings.every((drawing) => drawing.locked === true),
  )
</script>
