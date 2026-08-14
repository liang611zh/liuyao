import { useCallback, useEffect, useState } from 'react'
import {
  getCurrentProfile,
  getCurrentUser,
  initCloudAccount,
  isCloudConfigured,
  onAccountChange,
  type Profile,
} from '@/lib/supabase'
import type { User } from '@supabase/supabase-js'

/**
 * 登录状态。Supabase SDK 是动态 import 的，未配置或未登录时
 * 这个 hook 全程不会触发任何网络请求。
 */
export function useAccount() {
  const [user, setUser] = useState<User | null>(getCurrentUser)
  const [profile, setProfile] = useState<Profile | null>(getCurrentProfile)

  useEffect(() => {
    const sync = () => {
      setUser(getCurrentUser())
      setProfile(getCurrentProfile())
    }
    const unsubscribe = onAccountChange(sync)
    // 只有确实可能已登录（本机有会话，或刚从登录邮件跳回来）才会真的加载 SDK
    initCloudAccount().catch((err) => console.error('cloud init failed:', err))
    sync()
    return unsubscribe
  }, [])

  const refresh = useCallback(() => {
    setUser(getCurrentUser())
    setProfile(getCurrentProfile())
  }, [])

  return { user, profile, configured: isCloudConfigured(), refresh }
}
