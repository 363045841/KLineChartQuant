<!--
  行内表单行：左侧常显标签，右侧控件列。
  - 参数行与时间周期行共用同一套标签字号、间距和右对齐；
  - 控件保持自身宽度，由行尾统一靠右，不再各自计算列宽；
  - 不持有业务状态，标签语义只由 forId 决定。
-->
<template>
  <div class="form-row">
    <label class="form-row__label" :for="forId"><slot name="label" /></label>
    <div class="form-row__control"><slot /></div>
  </div>
</template>

<script setup lang="ts">
  defineProps<{
    /** 控件 id；可见标签与控件建立关联。 */
    forId: string
  }>()
</script>

<style scoped>
  .form-row {
    display: flex;
    align-items: center;
    gap: var(--klc-space-16);
    min-height: var(--klc-density-default, 32px);
  }

  /* 标签吃掉剩余宽度，控件列按自身宽度贴右。 */
  .form-row__label {
    display: flex;
    flex: 1 1 auto;
    align-items: baseline;
    gap: var(--klc-space-6, 6px);
    min-width: 0;
    font-size: var(--klc-text-12-font-size);
    line-height: var(--klc-text-12-line-height);
    font-weight: var(--klc-text-label-12-font-weight);
    color: var(--klc-color-ui-muted);
  }

  .form-row__control {
    flex: none;
    min-width: 0;
  }
</style>
