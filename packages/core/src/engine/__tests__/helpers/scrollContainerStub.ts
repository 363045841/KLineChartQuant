/**
 * 横向滚动容器替身（viewport DOM 测试共享）。
 *
 * scrollLeft 的读写落到闭包变量，用于验证滚动桥接与哑 DOM 行为；
 * setter 可用 transformScrollLeft 定制，模拟浏览器取整夹取或记录写入。
 * 仅供 __tests__ 消费；vitest 只收集 *.test.ts，本文件不会被当作测试。
 */

/** 构造横向滚动容器替身。 */
export function createScrollContainerStub(
  options: {
    /** 容器可视宽度（默认 100）。 */
    clientWidth?: number
    /** 容器可视高度（默认 100）。 */
    clientHeight?: number
    /** 写入前的转换（如模拟浏览器取整夹取或记录写入），默认原样存储。 */
    transformScrollLeft?: (value: number) => number
  } = {},
): HTMLElement {
  let scrollLeft = 0
  const transform = options.transformScrollLeft ?? ((value: number) => value)
  return {
    clientWidth: options.clientWidth ?? 100,
    clientHeight: options.clientHeight ?? 100,
    get scrollLeft() {
      return scrollLeft
    },
    set scrollLeft(value: number) {
      scrollLeft = transform(value)
    },
  } as unknown as HTMLElement
}
