<!-- 开源致谢：按分组列出第三方库的名称、版本与许可证。 -->
<template>
  <template v-for="section in credits" :key="section.id">
    <div class="settings-subsection-label">{{ section.title }}</div>
    <a
      v-for="credit in section.items"
      :key="credit.name"
      class="settings-item credit-item"
      :href="credit.url"
      target="_blank"
      rel="noopener noreferrer"
      :title="credit.url"
    >
      <span class="credit-name">{{ credit.name }}</span>
      <span class="credit-version">{{ credit.version }} · {{ credit.license }}</span>
    </a>
  </template>
</template>

<script setup lang="ts">
  import { getOpenSourceCredits } from '../../credits/openSourceCredits.js'

  const credits = getOpenSourceCredits()
</script>

<style scoped src="../common/settings-item.css"></style>

<style scoped>
  /* 开源致谢的分组小标题：字体继承弹窗全局字体，仅做层级与留白。 */
  .settings-subsection-label {
    padding-block: var(--klc-spacing-sm) var(--klc-spacing-xs);
    /* 与设置行共用水平内边距，保持分组小标题与条目对齐。 */
    padding-inline: var(--klc-spacing-sm);
    font-size: var(--klc-typography-font-size-md);
    font-weight: var(--klc-typography-font-weight-bold);
    color: var(--klc-color-ui-muted);
  }

  .settings-item.credit-item {
    /* 纯文本条目用 32px 的紧凑行高，比控件行的 40px 更紧凑但不过密。 */
    min-block-size: 32px;
    padding-block: var(--klc-spacing-xs);
    cursor: pointer;
    text-decoration: none;
    /* 包名与版本号属于代码类内容，使用等宽字体。 */
    font-family: var(--klc-typography-font-family-mono);
  }

  .settings-item.credit-item:hover {
    background-color: var(--klc-color-ui-hover);
  }

  .settings-item.credit-item:focus-visible {
    outline: 2px solid var(--klc-color-ui-focus);
    outline-offset: 2px;
  }

  /* 包名继承致谢条目的等宽字体，不再单独声明字体栈。 */
  .credit-name {
    min-inline-size: 0;
    font-size: var(--klc-typography-font-size-md);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .credit-version {
    flex: 0 0 auto;
    font-size: var(--klc-typography-font-size-md);
    color: var(--klc-color-ui-muted);
    white-space: nowrap;
  }
</style>
