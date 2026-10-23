/** Pine 摆动点序列：左侧允许并列，右侧严格比较，确认发生在右窗口完成时。 */
function __pivotSeries(source: Series, left: number, right: number, highPoint: boolean): Series {
  if (!Number.isInteger(left) || left < 0 || !Number.isInteger(right) || right < 0)
    throw new RangeError('pivot 窗口必须是非负整数')
  return __deriveOnce(`pivot:${__seriesId(source)}:${left}:${right}:${highPoint}`, (_self, offset) => {
    if (offset + left + right >= __count()) return Number.NaN
    const center = source.at(offset + right)
    if (!Number.isFinite(center)) return Number.NaN
    for (let step = 1; step <= left; step++) {
      const value = source.at(offset + right + step)
      if (!Number.isFinite(value) || (highPoint ? value > center : value < center)) return Number.NaN
    }
    for (let step = 0; step < right; step++) {
      const value = source.at(offset + step)
      if (!Number.isFinite(value) || (highPoint ? value >= center : value <= center)) return Number.NaN
    }
    return center
  })
}
