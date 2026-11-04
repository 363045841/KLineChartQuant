<!-- 应用标题栏：无边框窗口的拖动区与品牌标识；窗口按钮由系统绘制（Windows / Linux 走 WCO）。 -->
<template>
  <header class="title-bar" :class="{ 'title-bar--mac': platform === 'darwin' }">
    <div class="title-bar__inner">
      <span class="title-bar__title">KCQ</span>
    </div>
  </header>
</template>

<script setup lang="ts">
  defineProps<{
    /** 宿主平台；macOS 需要给系统红绿灯让出位置。 */
    platform: string
  }>()
</script>

<style scoped>
  .title-bar {
    position: relative;
    flex: none;
    height: var(--desktop-titlebar-height);
    background: var(--klc-color-ui-background);
    border-bottom: 1px solid var(--klc-color-ui-border);
    /* 整条标题栏可拖动；按钮由系统绘制在覆盖层里，不需要 no-drag 区域。 */
    app-region: drag;
    user-select: none;
  }

  /* 内容收在系统给出的安全区内：Linux 的按钮可能在左、在右或两侧。 */
  .title-bar__inner {
    position: absolute;
    left: env(titlebar-area-x, 0px);
    top: env(titlebar-area-y, 0px);
    width: env(titlebar-area-width, 100%);
    height: env(titlebar-area-height, var(--desktop-titlebar-height));
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 12px;
    overflow: hidden;
  }

  /* 红绿灯固定在左上角；左右对称留位，标题仍然居中。 */
  .title-bar--mac .title-bar__inner {
    padding-inline: 82px;
  }

  /* 次要文本层级：比正文略粗一档以保持可读，但不抢工作台的视觉重心。 */
  .title-bar__title {
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.02em;
    color: var(--klc-color-text-tertiary);
    white-space: nowrap;
  }
</style>
