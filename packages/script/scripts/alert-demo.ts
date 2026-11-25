defineAlert({
  version: 2,
  name: 'AlertDemo',
  title: '警报示例',
  info: '同一根 K 线内，实时价格从触发价下方升至触发价或以上时发出警报。',
  frequency: 'per-bar',
  onBar() {
    const price = input.float(100, { title: '触发价格', min: 0, step: 0.01 })
    const prevPrice = barstate.prevPrice
    // 每根 K 线的第一次实时更新只建立比较基准。
    if (prevPrice === undefined) return

    const currentPrice = close[0]
    if (prevPrice < price && currentPrice >= price) {
      alert(`价格上穿 ${price}`)
    }
  },
})
