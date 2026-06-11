import type { DataFetcher } from '../controllers/types'
import { baostockDataFetcher } from './baostock'
import { hundredMockDataFetcher } from './hundred-mock'
import { thousandMockDataFetcher } from './thousand-mock'

export const routerDataFetcher: DataFetcher = (source, config) => {
  switch (source) {
    case 'baostock':
      return baostockDataFetcher(source, config)
    case 'mock-100':
      return hundredMockDataFetcher(source, config)
    case 'mock-10000':
      return thousandMockDataFetcher(source, config)
    default:
      return hundredMockDataFetcher(source, config)
  }
}
