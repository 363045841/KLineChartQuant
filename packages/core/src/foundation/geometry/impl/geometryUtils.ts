/**
 * geometry 模块实现：与业务无关的二维几何谓词与构造。
 *
 * 全部为纯函数、零依赖、无副作用；命中优先级与对象选择等业务语义由调用方保留。
 */

import type { Point, Rect } from '../types.js'

/** 两点间距离的平方；比较距离时避免开方。 */
export function distanceSq(a: Point, b: Point): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return dx * dx + dy * dy
}

/**
 * 判断点是否落在圆内（含边界）。
 * @param point 待测点
 * @param center 圆心
 * @param radius 半径
 */
export function pointInCircle(point: Point, center: Point, radius: number): boolean {
  return distanceSq(point, center) <= radius * radius
}

/** 由任意两个对角点构造 left/top/right/bottom 有序的轴对齐矩形。 */
export function rectFromPoints(a: Point, b: Point): Rect {
  return {
    left: Math.min(a.x, b.x),
    top: Math.min(a.y, b.y),
    right: Math.max(a.x, b.x),
    bottom: Math.max(a.y, b.y),
  }
}

/** 判断点是否落在轴对齐矩形内（含边界）。 */
export function pointInRect(point: Point, rect: Rect): boolean {
  return (
    point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom
  )
}

/** 两点连线的中点。 */
export function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

/**
 * 计算点 P 到线段 AB 的最短距离平方。
 * 投影点落在线段外时取最近端点距离。
 * @param px 待测点 X
 * @param py 待测点 Y
 * @param a 线段起点
 * @param b 线段终点
 */
export function pointToSegmentDistanceSq(px: number, py: number, a: Point, b: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lenSq = dx * dx + dy * dy
  const pointDx = px - a.x
  const pointDy = py - a.y
  if (lenSq === 0) return pointDx * pointDx + pointDy * pointDy

  let t = (pointDx * dx + pointDy * dy) / lenSq
  t = Math.max(0, Math.min(1, t))
  const nearestDx = px - (a.x + t * dx)
  const nearestDy = py - (a.y + t * dy)
  return nearestDx * nearestDx + nearestDy * nearestDy
}

/**
 * 判断点是否落在简单多边形内部（射线法）。
 * 边界上的结果不做保证；调用方命中判定会先看线段，不依赖边界语义。
 * @param point 待测点
 * @param polygon 多边形顶点，按环绕顺序给出
 */
export function pointInPolygon(point: Point, polygon: ReadonlyArray<Point>): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!
    const b = polygon[j]!
    if (a.y > point.y === b.y > point.y) continue
    const x = ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    if (point.x < x) inside = !inside
  }
  return inside
}

/**
 * 判断线段 AB 是否与轴对齐矩形相交（端点落入内部或线段穿过边界）。
 * @param a 线段起点
 * @param b 线段终点
 * @param rect 轴对齐矩形
 */
export function segmentIntersectsRect(a: Point, b: Point, rect: Rect): boolean {
  if (pointInRect(a, rect) || pointInRect(b, rect)) return true

  const topLeft = { x: rect.left, y: rect.top }
  const topRight = { x: rect.right, y: rect.top }
  const bottomRight = { x: rect.right, y: rect.bottom }
  const bottomLeft = { x: rect.left, y: rect.bottom }
  return (
    segmentsIntersect(a, b, topLeft, topRight) ||
    segmentsIntersect(a, b, topRight, bottomRight) ||
    segmentsIntersect(a, b, bottomRight, bottomLeft) ||
    segmentsIntersect(a, b, bottomLeft, topLeft)
  )
}

/** 使用叉积判断两个闭合线段是否相交。 */
function segmentsIntersect(a: Point, b: Point, c: Point, d: Point): boolean {
  const abC = cross(a, b, c)
  const abD = cross(a, b, d)
  const cdA = cross(c, d, a)
  const cdB = cross(c, d, b)
  if (abC === 0 && pointOnSegment(c, a, b)) return true
  if (abD === 0 && pointOnSegment(d, a, b)) return true
  if (cdA === 0 && pointOnSegment(a, c, d)) return true
  if (cdB === 0 && pointOnSegment(b, c, d)) return true
  return abC > 0 !== abD > 0 && cdA > 0 !== cdB > 0
}

/** 返回有向线段 AB 与点 C 的叉积。 */
function cross(a: Point, b: Point, c: Point): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
}

/** 判断共线点是否落在线段端点范围内。 */
function pointOnSegment(point: Point, a: Point, b: Point): boolean {
  return (
    point.x >= Math.min(a.x, b.x) &&
    point.x <= Math.max(a.x, b.x) &&
    point.y >= Math.min(a.y, b.y) &&
    point.y <= Math.max(a.y, b.y)
  )
}
