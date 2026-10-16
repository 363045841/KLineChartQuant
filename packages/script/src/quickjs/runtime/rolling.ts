/** TA 内部滑动窗口：按历史顺序推进，复用累计状态并缓存每根结果。 */

/** 单个窗口的增删与聚合；index 为绝对 K 线下标。 */
interface RollingWindow {
  push(value: number, index: number): void
  remove(value: number, index: number): void
  value(): number
}

/** 创建缓存窗口序列；跳读时迭代补齐历史，历史查询直接命中派生缓存。 */
function __rollingSeries(
  key: string,
  source: Series,
  length: number,
  create: () => RollingWindow,
): Series {
  const cached = __derivedCache.get(key)
  if (cached) return cached
  const window = create()
  const samples: number[] = []
  let processed = -1
  return __deriveOnce(key, (self, offset) => {
    const count = __count()
    const target = count - 1 - offset
    if (target < 0) return Number.NaN
    // 每次递入只补一根，深度恒为两层，不随首次查询的历史长度增长。
    while (processed + 1 < target) self.at(count - 2 - processed)
    const slot = target % length
    if (target >= length) window.remove(samples[slot] ?? Number.NaN, target - length)
    const current = source.at(offset)
    samples[slot] = current
    window.push(current, target)
    processed = target
    return target + 1 < length ? Number.NaN : window.value()
  })
}

/** 补偿求和减少连续增删的舍入误差；非有限值单独计数，移出后恢复正常。 */
class __RollingTotal {
  finite = 0
  private correction = 0
  private missing = 0
  private positiveInfinity = 0
  private negativeInfinity = 0

  /** 按 direction 加入或移除一个值。 */
  update(value: number, direction: number): void {
    if (Number.isNaN(value)) this.missing += direction
    else if (value === Infinity) this.positiveInfinity += direction
    else if (value === -Infinity) this.negativeInfinity += direction
    else {
      const adjusted = value * direction - this.correction
      const next = this.finite + adjusted
      this.correction = next - this.finite - adjusted
      this.finite = next
    }
  }

  /** 返回含 NaN、Infinity 语义的当前和。 */
  value(): number {
    if (this.missing || (this.positiveInfinity && this.negativeInfinity)) return Number.NaN
    if (this.positiveInfinity) return Infinity
    if (this.negativeInfinity) return -Infinity
    return this.finite
  }
}

/** 求和与 SMA 共用累计器；窗口每推进一根只增删各一次。 */
function __sumWindow(divisor: number): RollingWindow {
  const total = new __RollingTotal()
  return {
    /** 加入新值。 */
    push(value) {
      total.update(value, 1)
    },
    /** 移除过期值。 */
    remove(value) {
      total.update(value, -1)
    },
    /** 返回窗口和或均值。 */
    value() {
      return total.value() / divisor
    },
  }
}

/** WMA 累计器：移窗时减去旧窗口和，再加入权重最大的当前值。 */
function __weightedWindow(length: number): RollingWindow {
  const total = new __RollingTotal()
  const weighted = new __RollingTotal()
  let count = 0
  return {
    /** 加入当前值，预热期权重随窗口长度递增。 */
    push(value) {
      count++
      total.update(value, 1)
      if (Number.isFinite(value)) weighted.update(value * count, 1)
    },
    /** 所有旧值的权重减一，最老值权重降为零。 */
    remove(value) {
      weighted.update(total.finite, -1)
      total.update(value, -1)
      count--
    },
    /** 非有限值沿用窗口和语义，其余返回加权平均。 */
    value() {
      const sum = total.value()
      return Number.isFinite(sum) ? weighted.value() / ((length * (length + 1)) / 2) : sum
    },
  }
}

/** 总体标准差：用可增删的 Welford 统计量，避免每根两次扫描窗口。 */
function __deviationWindow(length: number): RollingWindow {
  let count = 0
  let missing = 0
  let mean = 0
  let deviation = 0
  return {
    /** 加入有限值，非有限值只记录窗口无效状态。 */
    push(value) {
      if (!Number.isFinite(value)) {
        missing++
        return
      }
      count++
      const delta = value - mean
      mean += delta / count
      deviation += delta * (value - mean)
    },
    /** 移除有限值对应的均值与离差贡献。 */
    remove(value) {
      if (!Number.isFinite(value)) {
        missing--
        return
      }
      count--
      if (count === 0) {
        mean = 0
        deviation = 0
        return
      }
      const delta = value - mean
      mean -= delta / count
      deviation -= delta * (value - mean)
    },
    /** 舍入误差可能产生极小负数，方差下界为零。 */
    value() {
      return missing ? Number.NaN : Math.sqrt(Math.max(0, deviation) / length)
    },
  }
}

/** 单调队列维护最高/最低值，每个下标最多入队、出队各一次。 */
function __extremeWindow(length: number, highest: boolean): RollingWindow {
  const queue: { value: number; index: number }[] = []
  let head = 0
  let missing = 0
  return {
    /** 弹出不会再成为极值的队尾，再加入当前值。 */
    push(value, index) {
      if (Number.isNaN(value)) {
        missing++
        return
      }
      while (queue.length > head) {
        const last = queue.at(-1)
        if (!last || (highest ? last.value > value : last.value < value)) break
        queue.pop()
      }
      queue.push({ value, index })
    },
    /** 过期值若在队首则出队；定期压缩使存储不超过窗口的常数倍。 */
    remove(value, index) {
      if (Number.isNaN(value)) missing--
      else if (queue[head]?.index === index) head++
      if (head >= length) {
        queue.splice(0, head)
        head = 0
      }
    },
    /** 有无效样本时留空，否则队首就是窗口极值。 */
    value() {
      return missing ? Number.NaN : (queue[head]?.value ?? Number.NaN)
    },
  }
}
