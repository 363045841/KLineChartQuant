<!-- 标签栏应用图标菜单：复用 Dropdown Menu 与关于弹窗。 -->
<template>
  <DropMenu
    class="workspace-menu"
    label="应用菜单"
    placement="bottom"
    tooltip-placement="bottom"
    density="loose"
    :groups="menu.groups"
    @select="menu.select"
  >
    <template #trigger>
      <ColorAvatar :color="accent" variant="contrast">
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
  .workspace-menu {
    /* 只保留语义与焦点，不给应用图标再包底色、描边或阴影；外观走 control-button 变量。 */
    --control-button-width: 30px;
    --control-button-height: var(--tab-pill-height, 26px);
    --control-button-inline-padding: 0;
    --control-button-active-background: transparent;
    --control-button-focus-shadow: none;

    flex: none;
    /* 触发器是 inline-flex，这里必须消掉行盒的基线留白，图标才与标签胶囊同心。 */
    display: flex;
    align-items: center;
    justify-content: center;
    height: var(--tab-pill-height, 26px);
    line-height: 0;
    -webkit-app-region: no-drag;
    app-region: no-drag;
  }
  .workspace-menu__brand { display: block; width: 100%; height: 100%; }
  .workspace-menu__brand :deep(svg) { display: block; width: 100%; height: 100%; }
  .workspace-menu__brand :deep(circle) { fill: none; }
  .workspace-menu__brand :deep(path) {
    /* 与应用图标一致：纯白折线，去掉 SVG 自带的半透明与磨砂滤镜。 */
    stroke: currentColor;
    stroke-opacity: 1;
    filter: none;
  }
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
