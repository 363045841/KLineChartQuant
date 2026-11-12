<!-- 居中的产品简介；沿用共享弹窗，开源致谢在本弹窗内按需展开。 -->
<template>
  <BaseModal
    :open="open"
    :aria-label="`关于 ${APP_NAME}`"
    width="fit-content"
    min-width="320px"
    :draggable="false"
    @update:open="emit('update:open', $event)"
  >
    <template #header><span aria-hidden="true" /></template>
    <section class="about-dialog">
      <span class="about-dialog__logo" aria-hidden="true" v-html="brandLogoMarkup" />
      <h2 class="about-dialog__name">{{ APP_NAME }}</h2>
      <p class="about-dialog__version">版本 {{ APP_VERSION }}</p>
      <a class="about-dialog__github" :href="APP_GITHUB_URL" target="_blank" rel="noopener noreferrer">
        <IconBrandGithub aria-hidden="true" />
        <span>GitHub</span>
      </a>
      <details class="about-dialog__credits">
        <summary>
          <svg class="about-dialog__expand-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="m9 5 7 7-7 7" />
          </svg>
          <span>开源致谢</span>
        </summary>
        <div class="about-dialog__credits-list"><OpenSourceCredits /></div>
      </details>
    </section>
  </BaseModal>
</template>

<script setup lang="ts">
  import BaseModal from '@vue-src/components/common/BaseModal.vue'
  import IconBrandGithub from '~icons/tabler/brand-github'
  import brandLogoMarkup from '../assets/kcq-logo.svg?raw'
  import { APP_GITHUB_URL, APP_NAME, APP_VERSION } from '../impl/appMetadata.js'
  import OpenSourceCredits from './OpenSourceCredits.vue'

  defineProps<{ open: boolean }>()
  const emit = defineEmits<{ 'update:open': [open: boolean] }>()
</script>

<style scoped>
  .about-dialog {
    display: flex;
    flex-direction: column;
    align-items: center;
    /* 纵向留白统一由弹窗正文提供，这里不再叠加。 */
    text-align: center;
    font-size: var(--klc-typography-font-size-md);
    line-height: 1.5;
  }
  .about-dialog__logo {
    display: block;
    width: 48px;
    height: 48px;
    margin-bottom: var(--klc-spacing-lg);
  }
  .about-dialog__logo :deep(svg) { display: block; width: 100%; height: 100%; }
  .about-dialog__name {
    margin: 0;
    font-size: 1rem;
    line-height: 1.4;
    font-weight: var(--klc-typography-font-weight-bold);
    color: var(--klc-color-ui-text);
  }
  .about-dialog__version {
    margin-block: var(--klc-spacing-xs) var(--klc-spacing-lg);
    color: var(--klc-color-ui-muted);
    font-size: var(--klc-typography-font-size-md);
  }
  .about-dialog__github {
    display: inline-flex;
    align-items: center;
    gap: var(--klc-spacing-xs);
    padding: var(--klc-spacing-xs) var(--klc-spacing-sm);
    color: var(--klc-color-ui-muted);
    text-decoration: none;
    border-radius: var(--klc-radius-sm);
    font-size: var(--klc-typography-font-size-md);
  }
  .about-dialog__github:hover { color: var(--klc-color-ui-text); background: var(--klc-color-ui-hover); }
  .about-dialog__github:focus-visible,
  .about-dialog__credits summary:focus-visible { outline: 2px solid var(--klc-color-ui-accent); outline-offset: 2px; }
  .about-dialog__github svg { width: 1.1em; height: 1.1em; }
  .about-dialog__credits { width: 100%; margin-top: var(--klc-spacing-lg); }
  .about-dialog__credits summary {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--klc-spacing-xs);
    list-style: none;
    width: fit-content;
    margin-inline: auto;
    padding: var(--klc-spacing-xs) var(--klc-spacing-sm);
    color: var(--klc-color-ui-muted);
    font-size: var(--klc-typography-font-size-md);
    cursor: pointer;
  }
  .about-dialog__credits summary:hover { color: var(--klc-color-ui-text); }
  .about-dialog__credits summary::-webkit-details-marker { display: none; }
  .about-dialog__expand-icon {
    flex: none;
    width: 12px;
    height: 12px;
    transition: transform var(--klc-motion-dur-fast) var(--klc-motion-ease-standard);
  }
  .about-dialog__credits[open] .about-dialog__expand-icon { transform: rotate(90deg); }
  .about-dialog__credits-list { margin-top: var(--klc-spacing-md); text-align: start; }
</style>
