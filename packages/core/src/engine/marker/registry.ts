import { hitTestShape } from '../../semantic/drawShape'

/**
 * 标记类型
 */
export type MarkerShape = 'triangle' | 'circle'

/**
 * 标记状态
 */
export type MarkerState = 'normal' | 'hovered'

/**
 * 标记类型描述注册表
 */
export const MARKER_TYPE_DESCRIPTIONS: Record<string, string> = {
  RISE_WITH_VOLUME: '量价齐升',
  RISE_WITHOUT_VOLUME: '量缩价升',
  FALL_WITH_VOLUME: '量价齐缩',
  FALL_WITHOUT_VOLUME: '量升价缩',
}

/**
 * 注册新的标记类型描述
 * @param type 标记类型
 * @param description 描述文本
 */
export function registerMarkerTypeDescription(type: string, description: string): void {
  MARKER_TYPE_DESCRIPTIONS[type] = description
}

/**
 * 标记实体
 */
export interface MarkerEntity {
  id: string
  type: MarkerShape
  /** 标记类型描述 */
  markerType: string
  /** 包围盒左上角 x 坐标 */
  x: number
  /** 包围盒左上角 y 坐标 */
  y: number
  /** 包围盒宽度 */
  width: number
  /** 包围盒高度 */
  height: number
  /** 对应的 K 线索引 */
  dataIndex: number
  /** 额外元数据（如量价关系类型等） */
  metadata: Record<string, any>
}

// ============ 自定义标记类型（语义化配置） ============

/** 自定义标记形状 */
export type CustomMarkerShape =
  | 'arrow_up'
  | 'arrow_down'
  | 'flag'
  | 'circle'
  | 'rectangle'
  | 'diamond'

/** 自定义标记样式 */
export interface CustomMarkerStyle {
  fillColor?: string
  strokeColor?: string
  textColor?: string
  size?: number
  lineWidth?: number
  opacity?: number
}

/** 自定义标记标签 */
export interface CustomMarkerLabel {
  text: string
  position?: 'left' | 'right' | 'top' | 'bottom' | 'inside'
  align?: 'start' | 'center' | 'end'
  fontSize?: number
  offset?: { x?: number; y?: number }
}

/** 自定义标记实体 */
export interface CustomMarkerEntity {
  id: string
  /**
   * 日期时间字符串
   * - 日K/周K/月K: "YYYY-MM-DD"
   * - 分钟K: "YYYY-MM-DD HH:mm"
   */
  date: string
  /** Unix 毫秒时间戳（由 date 解析生成，用于二分查找） */
  timestamp: number
  shape: CustomMarkerShape
  groupKey?: string
  offset?: { x?: number; y?: number }
  style?: CustomMarkerStyle
  label?: CustomMarkerLabel
  metadata?: Record<string, unknown>
}

/**
 * 标记 Manager
 */
export class MarkerManager {
  /** 当前帧可见的标记集合（key: marker.id） */
  private markers: Map<string, MarkerEntity> = new Map()
  /** 当前 hover 的标记 ID（跨帧持久） */
  private hoveredMarkerId: string | null = null
  /** 上一帧 hover 的标记 ID（用于触发 enter/leave 事件） */
  private lastHoveredId: string | null = null

  // ============ 自定义标记状态管理 ============
  /** 自定义标记集合 */
  private customMarkers: Map<string, CustomMarkerEntity> = new Map()
  /** 自定义标记位置缓存（用于 hitTest） */
  private customMarkerPositions: Map<
    string,
    { x: number; y: number; size: number; shape: CustomMarkerShape }
  > = new Map()

  /**
   * 清空标记集合
   * 注意：不清除 hoveredMarkerId，保持 hover 状态跨帧持久
   */
  clear(): void {
    this.markers.clear()
  }

  /**
   * 注册标记
   * @param marker 标记实体
   */
  register(marker: MarkerEntity): void {
    this.markers.set(marker.id, marker)
  }

  /**
   * 获取标记状态
   * @param id 标记 ID
   * @returns 'hovered' 或 'normal'
   */
  getState(id: string): MarkerState {
    if (this.hoveredMarkerId === id) {
      return 'hovered'
    }
    return 'normal'
  }

  /**
   * 命中测试
   * @param x 鼠标 x 坐标
   * @param y 鼠标 y 坐标
   * @param padding 命中区域扩展（默认 3px）
   * @returns 命中的标记，未命中返回 null
   */
  hitTest(x: number, y: number, padding: number = 3): MarkerEntity | null {
    for (const marker of this.markers.values()) {
      if (
        x >= marker.x - padding &&
        x <= marker.x + marker.width + padding &&
        y >= marker.y - padding &&
        y <= marker.y + marker.height + padding
      ) {
        return marker
      }
    }
    return null
  }

  /**
   * 设置 hover 状态
   * @param id 标记 ID，null 表示清除 hover
   */
  setHover(id: string | null): void {
    this.hoveredMarkerId = id
    this.lastHoveredId = id
  }

  /**
   * 验证 hover 状态
   * 检查当前 hover 的标记是否仍在视口内，不在则清除
   */
  validateHoverState(): void {
    if (this.hoveredMarkerId !== null && !this.markers.has(this.hoveredMarkerId)) {
      this.hoveredMarkerId = null
    }
  }

  /**
   * 获取当前 hover 的标记实体
   * @returns hover 的标记，不存在返回 null
   */
  getHoveredMarker(): MarkerEntity | null {
    if (this.hoveredMarkerId !== null) {
      return this.markers.get(this.hoveredMarkerId) || null
    }
    return null
  }

  /**
   * 获取上一帧 hover 的标记 ID
   * 用于检测 hover 状态变化
   * @returns 上一帧的 hover ID
   */
  getLastHoverId(): string | null {
    return this.lastHoveredId
  }

  /**
   * 获取所有当前可见的标记
   * @returns 标记数组
   */
  getAllMarkers(): MarkerEntity[] {
    return [...this.markers.values()]
  }

  // ============ 自定义标记管理方法 ============

  /**
   * 注册自定义标记
   */
  registerCustomMarker(marker: CustomMarkerEntity): void {
    this.customMarkers.set(marker.id, marker)
  }

  /**
   * 批量设置自定义标记
   */
  setCustomMarkers(markers: CustomMarkerEntity[]): void {
    this.clearCustomMarkers()
    for (const marker of markers) {
      this.customMarkers.set(marker.id, marker)
    }
  }

  /**
   * 清空自定义标记（含位置缓存）
   */
  clearCustomMarkers(): void {
    this.customMarkers.clear()
    this.customMarkerPositions.clear()
  }

  /**
   * 获取所有自定义标记
   */
  getCustomMarkers(): CustomMarkerEntity[] {
    return [...this.customMarkers.values()]
  }

  /**
   * 记录自定义标记位置（render 时调用）
   */
  setCustomMarkerPosition(
    id: string,
    x: number,
    y: number,
    size: number,
    shape: CustomMarkerShape,
  ): void {
    this.customMarkerPositions.set(id, { x, y, size, shape })
  }

  /**
   * 自定义标记点击测试
   * @param x 鼠标 x 坐标
   * @param y 鼠标 y 坐标
   * @returns 命中的自定义标记，未命中返回 null
   */
  hitTestCustomMarker(x: number, y: number): CustomMarkerEntity | null {
    for (const marker of this.customMarkers.values()) {
      const pos = this.customMarkerPositions.get(marker.id)
      if (pos) {
        // 使用实际渲染的大小进行命中测试
        if (hitTestShape(x, y, pos.shape, pos.x, pos.y, pos.size)) {
          return marker
        }
      }
    }
    return null
  }
}
