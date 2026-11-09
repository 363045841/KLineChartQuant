<!-- 标签栏应用图标菜单：复用 Dropdown Menu 与关于弹窗。 -->
<template>
  <DropMenu
    class="workspace-menu"
    label="应用菜单"
    placement="bottom"
    tooltip-placement="bottom"
    density="loose"
    :groups="menu.groups"
    trigger-class="workspace-menu__trigger"
    @select="menu.select"
  >
    <template #trigger>
      <ColorAvatar :color="accent">
        <span class="workspace-menu__brand" v-html="brandLogoMarkup" />
      </ColorAvatar>
    </template>
    <template #footer>
      <div class="workspace-menu__appearance">
        <span>外观</span>
        <ThemeModeControl :model-value="themeMode" label="明暗模式" @update:model-value="emit('theme-change', $event)" />
      </div>
    </template>
  </DropMenu>
  <AboutDialog v-model:open="menu.aboutOpen.value" />
</template>

<script setup lang="ts">
  import type { ChartSettings } from '@363045841yyt/klinechart-core/config'
  import ColorAvatar from '@vue-src/components/common/ColorAvatar.vue'
  import DropMenu from '@vue-src/components/common/DropMenu.vue'
  import ThemeModeControl from '@vue-src/components/common/ThemeModeControl.vue'
  import brandLogoMarkup from '../assets/kcq-logo.svg?raw'
  import { useWorkspaceMenu } from '../impl/useWorkspaceMenu.js'
  import AboutDialog from './AboutDialog.vue'

  defineProps<{ accent: string; themeMode?: ChartSettings['theme'] }>()
  const emit = defineEmits<{ 'theme-change': [mode: ChartSettings['theme']] }>()
  const menu = useWorkspaceMenu()
</script>

<style scoped>
  .workspace-menu { flex: none; -webkit-app-region: no-drag; app-region: no-drag; }
  /* 按钮只提供语义与焦点，不给应用图标再包底色、描边或阴影。 */
  .workspace-menu :deep(.workspace-menu__trigger),
  .workspace-menu :deep(.workspace-menu__trigger:hover),
  .workspace-menu :deep(.workspace-menu__trigger[aria-expanded='true']) {
    width: 30px;
    height: 30px;
    padding: 0;
    border: 0;
    background: transparent;
    box-shadow: none;
  }
  .workspace-menu__brand { display: block; width: 100%; height: 100%; }
  /* 深色徽章与左侧工具栏的选中态保持一致，浅色仍保留工作区标识色。 */
  .workspace-menu :deep(.color-avatar) {
    background: light-dark(
      color-mix(in srgb, var(--avatar-color) 22%, transparent),
      color-mix(in srgb, var(--klc-color-ui-text) 90%, var(--klc-color-ui-surface))
    );
    color: light-dark(var(--avatar-color), var(--klc-color-ui-background));
  }
  .workspace-menu__brand :deep(svg) { display: block; width: 100%; height: 100%; }
  .workspace-menu__brand :deep(circle) { fill: none; }
  .workspace-menu__brand :deep(path) { stroke: currentColor; }
  .workspace-menu__appearance {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--klc-spacing-lg);
    /* 菜单 header 自带 8px，补齐选项行的 12px，左右内容保持同一基线。 */
    padding-inline: var(--klc-space-4, 4px);
    padding-block: var(--klc-space-4, 4px);
    color: var(--klc-color-ui-muted);
    font-size: var(--klc-typography-font-size-md);
    font-weight: var(--klc-typography-font-weight-normal);
  }
</style>
