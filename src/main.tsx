import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ThemeProvider } from 'next-themes'

import App from './App'
import { Toaster } from '@/components/ui/sonner'
import { initAnalytics } from '@/lib/analytics'
import { getLang } from '@/lib/i18n'
import './index.css'

// 未配置 POSTHOG_KEY 或域名不在白名单时，这一步不会发出任何网络请求
initAnalytics()

document.documentElement.lang = getLang()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* 起卦是件夜里做的事，默认给暗色；用户切过之后 next-themes 会记住 */}
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
      <App />
      <Toaster position="top-center" />
    </ThemeProvider>
  </StrictMode>,
)
