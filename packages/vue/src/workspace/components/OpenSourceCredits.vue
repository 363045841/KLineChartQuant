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
  import '../../components/common/settings-item.css'

  import { getOpenSourceCredits } from '@vue-src/credits/openSourceCredits.js'

  const credits = getOpenSourceCredits()
</script>


<style scoped>
  /* 开源致谢的分组小标题：与致谢行共用弹窗 inset，保证标题和条目文字左对齐。 */
  .settings-subsection-label {
    padding-block: var(--klc-spacing-sm) var(--klc-spacing-xs);
    padding-inline: var(--base-modal-content-inset);
    font-size: var(--klc-typography-font-size-md);
    font-weight: var(--klc-typography-font-weight-bold);
    color: var(--klc-color-ui-muted);
  }

  .settings-item.credit-item {
    gap: var(--klc-spacing-lg);
    /* 纯文本条目用 32px 的紧凑行高，比控件行的 40px 更紧凑但不过密。 */
    min-block-size: 32px;
    padding-block: var(--klc-spacing-xs);
    /* 横向 inset 由 .settings-item 统一提供；通栏行贴合弹窗左右边缘，不用圆角。 */
    border-radius: 0;
    cursor: pointer;
    text-decoration: none;
    /* 包名与版本号属于代码类内容，使用等宽字体。 */
    font-family: var(--klc-typography-font-family-mono);
  }

  .settings-item.credit-item:hover {
    background-color: var(--klc-color-ui-hover);
  }

  .settings-item.credit-item:focus-visible {
    /* 通栏行贴边，焦点环向内收才不会被正文的横向裁剪切掉。 */
    outline: 2px solid var(--klc-color-ui-focus);
    outline-offset: -2px;
  }

  /* 包名继承致谢条目的等宽字体，不再单独声明字体栈。 */
  .credit-name {
    min-inline-size: 0;
    font-size: var(--klc-typography-font-size-md);
    overflow-wrap: anywhere;
  }

  .credit-version {
    flex: 0 0 auto;
    font-size: var(--klc-typography-font-size-md);
    color: var(--klc-color-ui-muted);
    white-space: nowrap;
  }

  /* 窄屏按两行排版，保留完整名称与许可证，不强迫弹窗超出视口。 */
  @media (max-width: 540px) {
    .settings-item.credit-item {
      flex-wrap: wrap;
      gap: var(--klc-spacing-xs);
    }
    .credit-name { flex-basis: 100%; }
    .credit-version { white-space: normal; overflow-wrap: anywhere; }
  }
</style>
