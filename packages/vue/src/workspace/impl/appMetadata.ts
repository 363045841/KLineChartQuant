/** 关于界面的产品标识；版本与仓库地址直接取自包清单。 */
import pkg from '../../../package.json'

export const APP_NAME = 'KLineChartQuant'
export const APP_VERSION = pkg.version
export const APP_GITHUB_URL = pkg.repository.url.replace(/\.git$/, '')
