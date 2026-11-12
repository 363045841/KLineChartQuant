/**
 * 图例「移动指标」菜单：Core 只投影目标列表与按钮矩形，菜单外观和交互复用 DropMenu。
 * 菜单打开状态、坐标和分组都由本模块持有，KLineChart 只负责挂载组件。
 */
import type {
  ChartController,
  LegendAnchorRect,
  LegendMoveRequest,
} from '@363045841yyt/klinechart-core/controllers'
import type { DropMenuGroup } from '@vue-src/components/common/DropMenu.vue'
import { type Component, computed, type Ref, shallowRef } from 'vue'
import IconTablerArrowBarDown from '~icons/tabler/arrow-bar-down'
import IconTablerArrowBarUp from '~icons/tabler/arrow-bar-up'
import IconTablerChartLine from '~icons/tabler/chart-line'
import IconTablerLayoutGrid from '~icons/tabler/layout-grid'

type MoveOption = LegendMoveRequest['options'][number]
type MoveTarget = MoveOption['target']

/** 菜单只有一个分组；目标列表本身已是平铺顺序。 */
const MOVE_GROUP = 'move-to'
/** 按钮与面板之间的间距；与普通下拉的间距一致。 */
const MENU_OFFSET_PX = 4

/** 菜单项 id 与目标按下标对应，目标对象本身不适合做键。 */
function itemId(index: number): string {
  return `move-${index}`
}

/** 目标类型决定图标：主图、已有副图、在锚点上下新建副图。 */
function iconOf(target: MoveTarget): Component {
  if (target.kind === 'main') return IconTablerChartLine
  if (target.kind === 'pane') return IconTablerLayoutGrid
  return target.placement === 'above' ? IconTablerArrowBarUp : IconTablerArrowBarDown
}

export function useLegendMoveMenu(controller: Ref<ChartController | null>) {
  /** 当前菜单的图例实例 id；只在打开时写入。 */
  const instanceId = shallowRef<string | null>(null)
  /** Core 投影的目标列表；关闭后保留，保证 select 不被 update:open 的先后顺序影响。 */
  const options = shallowRef<ReadonlyArray<MoveOption>>([])
  /** 触发按钮的视口矩形；菜单贴在按钮下方。 */
  const anchor = shallowRef<LegendAnchorRect | null>(null)
  const open = shallowRef(false)

  const groups = computed<ReadonlyArray<DropMenuGroup>>(() => [
    {
      id: MOVE_GROUP,
      label: '',
      items: options.value.map((option, index) => ({
        id: itemId(index),
        label: option.label,
        icon: iconOf(option.target),
        disabled: !option.enabled,
      })),
    },
  ])

  const origin = computed(() =>
    open.value && anchor.value
      ? {
          x: anchor.value.left,
          y: anchor.value.top,
          width: anchor.value.width,
          height: anchor.value.height,
        }
      : null,
  )

  /** 打开菜单：目标列表和坐标都来自 Core 的这一次请求。 */
  function show(request: LegendMoveRequest & { anchor: LegendAnchorRect }): void {
    instanceId.value = request.id
    options.value = request.options
    anchor.value = request.anchor
    open.value = true
  }

  /** 面板自行关闭（外部点击 / Escape / 选中）时同步状态；焦点由 DropMenu 归还。 */
  function onUpdateOpen(next: boolean): void {
    if (!next) open.value = false
  }

  /** 选中目标后交给图例命令面执行迁移，菜单本身不推导布局规则。 */
  function select(selectedId: string): void {
    const index = options.value.findIndex((_option, position) => itemId(position) === selectedId)
    const option = options.value[index]
    const id = instanceId.value
    open.value = false
    if (!option?.enabled || id === null) return
    controller.value?.legend.moveTo(id, option.target)
  }

  return {
    groups,
    open,
    origin,
    offset: MENU_OFFSET_PX,
    show,
    select,
    onUpdateOpen,
  }
}
