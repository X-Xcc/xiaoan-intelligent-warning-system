import { PropsWithChildren } from 'react'
import { useLocale } from '@/i18n'
import './app.scss'

function App({ children }: PropsWithChildren<any>) {
  useLocale()
  return children
}

export default App
