import { PropsWithChildren } from 'react'
import { useLocale } from '@/i18n'
if (process.env.TARO_ENV === 'h5') require('./styles/h5-reset.scss')
require('./app.scss')

function App({ children }: PropsWithChildren<any>) {
  useLocale()
  return children
}

export default App
