<!--
  工具栏选项下拉：按品种能力过滤选项，行内可收藏常用项。
  收藏以紧凑按钮排在触发框右侧，当前品种不支持的收藏置灰保留。
-->
<template>
  <div class="option-picker">
    <DropMenu
      :label="title"
      :groups="groups"
      tooltip-placement="bottom"
      semantics="dialog"
      @select="select"
    >
      <template #trigger>
        <span class="selection-menu__value">{{ selectedLabel }}</span>
        <IconChevronDown class="selection-menu__chevron" aria-hidden="true" />
      </template>
      <template #item-action="{ item }">
        <button
          type="button"
          :aria-label="favoriteLabel(item)"
          :aria-pressed="isItemFavorite(item.id)"
          @click.stop="toggleItemFavorite(item.id)"
        >
          <IconStarFilled
            v-if="isItemFavorite(item.id)"
            class="option-picker__star"
            aria-hidden="true"
          />
          <IconStar v-else aria-hidden="true" />
        </button>
      </template>
    </DropMenu>

    <div
      v-if="favoriteOptions.length > 0"
      class="option-picker__favorites"
      role="group"
      :aria-label="favoritesLabel"
    >
      <BaseButton
        v-for="option in favoriteOptions"
        :key="option.value"
        variant="chip"
        :disabled="!isSupported(option.value)"
        :aria-pressed="option.value === selectedValue"
        @click="selectOption(option.value)"
      >
        {{ option.label }}
      </BaseButton>
    </div>
  </div>
</template>

<script setup lang="ts" generic="T extends string">
  import '@vue-src/components/common/menu/selection-menu.css'

  import BaseButton from '@vue-src/components/common/button/BaseButton.vue'
  import DropMenu, {
    type DropMenuGroup,
    type DropMenuItem,
  } from '@vue-src/components/common/menu/DropMenu.vue'
  import type { OptionFavoritesState } from '@vue-src/composables/chart/useOptionFavorites.js'
  import { computed } from 'vue'
  import IconChevronDown from '~icons/tabler/chevron-down'
  import IconStar from '~icons/tabler/star'
  import IconStarFilled from '~icons/tabler/star-filled'

  const props = defineProps<{
    /** 菜单标题，也是触发器的可访问名称。 */
    title: string
    /** 右侧收藏按钮组的可访问名称。 */
    favoritesLabel: string
    /** 全部选项；数组顺序即菜单与收藏按钮的顺序。 */
    options: ReadonlyArray<{ label: string; value: T }>
    /** 当前品种支持的选项；省略时不过滤。 */
    supported?: ReadonlyArray<T>
    modelValue?: string
    /** 由调用方按领域注入的收藏状态。 */
    favorites: OptionFavoritesState<T>
  }>()

  const emit = defineEmits<{
    (e: 'update:modelValue', value: T): void
  }>()

  /** 当前品种支持的选项集合；未提供能力时为 null，表示不过滤。 */
  const supportedSet = computed<ReadonlySet<T> | null>(() =>
    props.supported ? new Set(props.supported) : null,
  )

  /** 下拉可见选项：保持配置顺序，能力只做过滤。 */
  const visibleOptions = computed(() => {
    const supported = supportedSet.value
    if (supported === null) return [...props.options]
    return props.options.filter((option) => supported.has(option.value))
  })

  /** 收藏集合：渲染前只建一次，逐项判定不再扫描选项表。 */
  const favoriteIds = computed(() => new Set<string>(props.favorites.favoriteOptions.value))

  /** 右侧收藏按钮：保持配置顺序，不跟随收藏先后跳动。 */
  const favoriteOptions = computed(() =>
    props.options.filter((option) => favoriteIds.value.has(option.value)),
  )

  /** 当前选中选项；非法或缺失值回退到首个可见选项。 */
  const selectedValue = computed(() => {
    const options = visibleOptions.value
    return options.find((option) => option.value === props.modelValue)?.value ?? options[0]?.value
  })

  const groups = computed<DropMenuGroup[]>(() => [
    {
      id: 'options',
      label: props.title,
      items: visibleOptions.value.map((option) => ({
        id: option.value,
        label: option.label,
        checked: option.value === selectedValue.value,
        selection: 'radio',
      })),
    },
  ])

  const selectedLabel = computed(
    () => visibleOptions.value.find((option) => option.value === selectedValue.value)?.label ?? '',
  )

  /** 菜单项 id 来自本组选项，按值域查找即可还原选项，不做字符串断言。 */
  function findOption(itemId: string): T | null {
    return props.options.find((option) => option.value === itemId)?.value ?? null
  }

  /** 当前品种是否支持该选项；能力未知时视为支持。 */
  function isSupported(option: T): boolean {
    const supported = supportedSet.value
    return supported === null || supported.has(option)
  }

  function isItemFavorite(itemId: string): boolean {
    return favoriteIds.value.has(itemId)
  }

  /** 星标只切换收藏，不改变当前选项，菜单保持打开。 */
  function toggleItemFavorite(itemId: string): void {
    const option = findOption(itemId)
    if (option !== null) props.favorites.toggleFavorite(option)
  }

  /** 星标的可访问名称：带上选项，读屏能区分菜单里的每一颗星。 */
  function favoriteLabel(item: DropMenuItem): string {
    return `${isItemFavorite(item.id) ? '取消收藏' : '收藏'} ${item.label}`
  }

  /** 菜单与右侧按钮共用切换入口；已选项不重复上报。 */
  function selectOption(option: T): void {
    if (option !== props.modelValue) emit('update:modelValue', option)
  }

  function select(_groupId: string, itemId: string): void {
    const option = findOption(itemId)
    if (option !== null) selectOption(option)
  }
</script>

<style scoped>
  .option-picker,
  .option-picker__favorites {
    display: flex;
    align-items: center;
    gap: var(--klc-space-2, 2px);
  }

  /* 收藏按钮与触发器等高：高度跟着工具栏控件高度走，窄屏自动跟随。 */
  .option-picker__favorites {
    --base-button-height: var(--control-button-height, 30px);
  }

  /* 收藏态颜色直接落在图标上：按钮颜色由菜单共享样式的 hover/focus 状态管理。 */
  .option-picker__star {
    color: var(--klc-color-ui-warning);
  }
</style>
