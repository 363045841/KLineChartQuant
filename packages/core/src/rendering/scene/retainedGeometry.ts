/** 保留最近一次投影几何；输入版本不变时复用，清屏后的绘制仍由调用方执行。 */

/** 创建一个有界的几何保留槽，版本比较由业务投影定义。 */
export function createRetainedGeometry<TGeometry, TRevision>(
  sameRevision: (previous: TRevision, next: TRevision) => boolean,
) {
  let retained: { revision: TRevision; geometry: TGeometry } | undefined

  return {
    /** 版本命中时返回原几何，否则生成并原子替换；生成失败不提交新版本。 */
    read(revision: TRevision, build: () => TGeometry): TGeometry {
      if (retained && sameRevision(retained.revision, revision)) return retained.geometry
      const geometry = build()
      retained = { revision, geometry }
      return geometry
    },
    /** 释放保留的版本和几何，由所属 Layer 或场景在卸载时调用。 */
    clear(): void {
      retained = undefined
    },
  }
}
