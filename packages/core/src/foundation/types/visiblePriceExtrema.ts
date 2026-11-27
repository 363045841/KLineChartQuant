/** 视口价格范围契约：主图真正落在视口内的 K 线高低点，由多个消费者共享。 */
export type VisiblePriceExtrema = {
  min: number
  max: number
  minIndex: number
  maxIndex: number
}
