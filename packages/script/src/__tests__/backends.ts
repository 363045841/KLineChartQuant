/** 两个执行后端的统一测试矩阵：同一脚本在两个后端上必须给出一致契约。 */
import { prepareNativeScript } from '../execution/impl/prepareNativeScript.js'
import { prepareQuickJSScript } from '../quickjs/impl/runQuickJSScript.js'

/** 后端列表；name 用于用例标题，prepare 返回可重复运行的对象。 */
export const BACKENDS = [
  { name: 'native', prepare: prepareNativeScript },
  { name: 'quickjs', prepare: prepareQuickJSScript },
]
