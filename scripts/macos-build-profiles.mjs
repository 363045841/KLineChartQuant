/** Mac 安装包的兼容档位；矩阵、编译目标与打包参数共用这一份定义。 */
export const macosBuildProfiles = {
  standard: {
    label: 'macos13',
    minimumSystemVersion: '13.0',
    goVersion: '1.27.3',
    buildTargets: {},
  },
  macos12: {
    label: 'macos12',
    minimumSystemVersion: '12.0',
    electronVersion: '43.8.7',
    goVersion: '1.26.10',
    backendOverrides: 'packages/desktop-electron/backends-macos12.json',
    buildTargets: { main: 'node24', renderer: 'chrome150' },
  },
}

/** 根据档位名称返回构建配置，未知名称直接报错。 */
export function resolveMacosBuildProfile(name) {
  if (!Object.hasOwn(macosBuildProfiles, name)) throw new Error(`未知 Mac 构建档位：${name}`)
  return macosBuildProfiles[name]
}
