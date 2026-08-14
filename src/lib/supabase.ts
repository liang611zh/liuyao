// ============================================================
// 六爻排盘 - 账户与云端同步 (Supabase)
// ============================================================
//
// SUPABASE_URL / SUPABASE_ANON_KEY / CLOUD_HOSTS 定义在 lib/config.ts，
// 由构建脚本从服务器环境变量注入。未填或域名不在白名单时整个模块保持关闭：
// 不加载 SDK、不发任何请求，卦例历史自动降级到 localStorage。
// 自建部署不接 Supabase 也能完整使用。
//
// SDK 约 120KB，用动态 import 交给 Vite 单独切块 —— 只有确实可能已登录
// （本机有会话、或刚从登录邮件跳回来、或用户主动点了账户）才会真的去拉那个 chunk。
//
// 建库：在 Supabase 控制台 SQL Editor 里执行 supabase/schema.sql
// 邮箱登录：控制台 Authentication → 把本站域名加进 Redirect URLs

import type { SupabaseClient, User } from '@supabase/supabase-js'
import { CLOUD_HOSTS, OAUTH_PROVIDERS, SUPABASE_ANON_KEY, SUPABASE_URL, isHostAllowed } from './config'
import { identifyUser, resetAnalyticsIdentity, track } from './analytics'
import { t } from './i18n'
import {
  getUnsyncedLocalRecords,
  isValidRecord,
  loadLocalHistory,
  markLocalRecordsSynced,
  deleteLocalRecord,
  saveLocalRecord,
  type ReadingRecord,
} from './history'

export interface Profile {
  id: string
  email: string | null
  nickname: string | null
  avatar_url: string | null
}

let sbClient: SupabaseClient | null = null
let clientPromise: Promise<SupabaseClient | null> | null = null
let currentUser: User | null = null
let currentProfile: Profile | null = null

// UI 订阅登录状态变化
const accountListeners = new Set<() => void>()

export function isCloudConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY && isHostAllowed(CLOUD_HOSTS))
}

export function getCurrentUser(): User | null {
  return currentUser
}

export function getCurrentProfile(): Profile | null {
  return currentProfile
}

/** 显示用名字：昵称 → 邮箱 → 用户 id */
export function getDisplayName(): string {
  if (currentProfile?.nickname) return currentProfile.nickname
  if (currentUser) return currentUser.email || currentUser.id
  return ''
}

export function onAccountChange(fn: () => void): () => void {
  accountListeners.add(fn)
  return () => accountListeners.delete(fn)
}

function notifyAccountChange(): void {
  accountListeners.forEach((fn) => {
    try {
      fn()
    } catch (err) {
      console.error('account listener failed:', err)
    }
  })
}

// ============================================================
// SDK 按需加载
// ============================================================

/** 本机是否已存有 Supabase 会话 */
function hasStoredSession(): boolean {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && /^sb-.*-auth-token$/.test(key)) return true
    }
  } catch {
    /* 隐私模式下读不到，当作没有 */
  }
  return false
}

function isAuthCallback(): boolean {
  return location.hash.includes('access_token') || /[?&]code=/.test(location.search)
}

export async function getSupabaseClient(): Promise<SupabaseClient | null> {
  if (!isCloudConfigured()) return null
  if (sbClient) return sbClient
  if (clientPromise) return clientPromise

  clientPromise = (async () => {
    const { createClient } = await import('@supabase/supabase-js')
    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // 从登录邮件跳回来时自动把 URL 里的凭据换成会话
        detectSessionInUrl: true,
      },
    })

    client.auth.onAuthStateChange((_event, session) => {
      const prevUser = currentUser
      currentUser = session ? session.user : null

      if (currentUser && !prevUser) {
        identifyUser(currentUser.id)
        // 登录后把匿名期间攒下的本地卦例搬上云
        syncLocalToCloud().catch((err) => console.error('sync failed:', err))
      } else if (!currentUser && prevUser) {
        currentProfile = null
        resetAnalyticsIdentity()
      }
      notifyAccountChange()
    })

    const { data } = await client.auth.getSession()
    currentUser = data?.session ? data.session.user : null
    if (currentUser) identifyUser(currentUser.id)

    sbClient = client
    notifyAccountChange()
    return client
  })()

  try {
    return await clientPromise
  } catch (err) {
    clientPromise = null
    throw err
  }
}

/** 页面启动时调用：只有确实可能已登录才会真的加载 SDK */
export async function initCloudAccount(): Promise<void> {
  if (!isCloudConfigured()) return
  if (!hasStoredSession() && !isAuthCallback()) return
  try {
    await getSupabaseClient()
    // 登录回调的凭据已换成会话，把它从地址栏抹掉，避免被复制分享出去
    if (isAuthCallback()) {
      history.replaceState(null, '', location.pathname)
    }
  } catch (err) {
    console.error('Supabase init failed:', err)
  }
}

// ============================================================
// 登录 / 登出
// ============================================================

/** 邮箱免密登录：发一封含登录链接的邮件，点开即登录，不用记密码 */
export async function signInWithEmail(email: string): Promise<void> {
  const client = await getSupabaseClient()
  if (!client) throw new Error(t('account_error_not_configured'))

  const { error } = await client.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: location.origin + location.pathname },
  })
  if (error) throw new Error(error.message)
  track('account_magic_link_sent')
}

// 第三方登录的展示名。品牌名不翻译，因此不走 i18n
const OAUTH_PROVIDER_NAMES: Record<string, string> = {
  google: 'Google',
  github: 'GitHub',
  apple: 'Apple',
  azure: 'Microsoft',
  discord: 'Discord',
  twitter: 'X',
}

export function getOAuthProviders(): string[] {
  if (!isCloudConfigured()) return []
  return (OAUTH_PROVIDERS || []).filter((p) => OAUTH_PROVIDER_NAMES[p])
}

export function getOAuthProviderName(provider: string): string {
  return OAUTH_PROVIDER_NAMES[provider] || provider
}

/**
 * 跳转到第三方授权页。回来时 detectSessionInUrl 会把凭据换成会话，
 * 同邮箱的账号 Supabase 会自动关联到同一个用户，不会因为换了登录方式就丢历史。
 */
export async function signInWithOAuth(provider: string): Promise<void> {
  const client = await getSupabaseClient()
  if (!client) throw new Error(t('account_error_not_configured'))

  track('account_oauth_started', { provider })
  const { error } = await client.auth.signInWithOAuth({
    provider: provider as Parameters<typeof client.auth.signInWithOAuth>[0]['provider'],
    options: { redirectTo: location.origin + location.pathname },
  })
  if (error) throw new Error(error.message)
}

export async function signOut(): Promise<void> {
  const client = await getSupabaseClient()
  if (!client) return
  await client.auth.signOut()
  currentUser = null
  currentProfile = null
  resetAnalyticsIdentity()
  notifyAccountChange()
  track('account_signed_out')
}

// ============================================================
// 用户资料
// ============================================================
//
// 用户本身由 Supabase Auth 存在 auth.users，前端读不到那张表，
// 只能通过 auth.getUser() 拿自己那条。昵称、头像这类应用字段放在
// public.profiles，注册时由数据库触发器自动建档。

export async function fetchProfile(): Promise<Profile | null> {
  const client = await getSupabaseClient()
  if (!client || !currentUser) return null

  const { data, error } = await client
    .from('profiles')
    .select('id, email, nickname, avatar_url')
    .eq('id', currentUser.id)
    .maybeSingle()
  if (error) throw new Error(error.message)

  currentProfile = data as Profile | null
  notifyAccountChange()
  return currentProfile
}

/**
 * 只有 nickname 一列被授予 update 权限（见 schema.sql 的列级 grant），
 * 改 email 或 avatar_url 会被数据库直接拒绝
 */
export async function updateNickname(nickname: string): Promise<Profile | null> {
  const client = await getSupabaseClient()
  if (!client || !currentUser) return null

  const trimmed = (nickname || '').trim()
  const { data, error } = await client
    .from('profiles')
    .update({ nickname: trimmed || null })
    .eq('id', currentUser.id)
    .select('id, email, nickname, avatar_url')
    .maybeSingle()
  if (error) throw new Error(error.message)

  if (data) currentProfile = data as Profile
  track('profile_nickname_updated')
  notifyAccountChange()
  return currentProfile
}

// ============================================================
// 卦例读写
// ============================================================

interface ReadingRow {
  id: string
  client_id: string | null
  cast_at: string
  cast_at_local: string
  yao_values: number[]
  day_ganzhi: string
  shichen: string
  xun_kong: string
  question: string | null
  mode: string
  lang: string
}

function recordToRow(rec: ReadingRecord) {
  return {
    // 幂等键：多标签页同时登录、上传超时后重试都不会写出重复条目。
    // user_id 不传 —— 由数据库的 default auth.uid() 填，客户端伪造不了别人的
    client_id: rec.id,
    cast_at: rec.castAt,
    cast_at_local: rec.castAtLocal,
    yao_values: rec.yaoValues,
    day_ganzhi: rec.dayGanzhi,
    shichen: rec.shichen,
    xun_kong: rec.xunKong,
    question: rec.question || null,
    mode: rec.mode,
    lang: rec.lang,
  }
}

function rowToRecord(row: ReadingRow): ReadingRecord {
  return {
    id: row.id,
    // 云端行的 id 是数据库生成的 uuid，与本机那份记录的 id 不同。
    // 带上 client_id 才能在删除云端记录时把本机的副本一并清掉
    clientId: row.client_id || null,
    castAt: row.cast_at,
    castAtLocal: row.cast_at_local,
    yaoValues: row.yao_values as ReadingRecord['yaoValues'],
    dayGanzhi: row.day_ganzhi,
    shichen: row.shichen,
    xunKong: row.xun_kong,
    question: row.question || '',
    mode: row.mode as ReadingRecord['mode'],
    lang: row.lang,
    synced: true,
  }
}

export async function fetchCloudReadings(limit = 100): Promise<ReadingRecord[] | null> {
  const client = await getSupabaseClient()
  if (!client || !currentUser) return null

  const { data, error } = await client
    .from('readings')
    .select('*')
    .order('cast_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(error.message)
  return (data as ReadingRow[]).map(rowToRecord).filter(isValidRecord)
}

/**
 * 用 upsert + 忽略冲突，让「同一条本地记录被传两次」变成空操作。
 * 冲突时不会返回行（on conflict do nothing），此时返回 null 表示「已经在云端了」。
 */
export async function insertCloudReading(rec: ReadingRecord): Promise<ReadingRecord | null> {
  const client = await getSupabaseClient()
  if (!client || !currentUser) return null

  const { data, error } = await client
    .from('readings')
    .upsert(recordToRow(rec), { onConflict: 'user_id,client_id', ignoreDuplicates: true })
    .select()
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data ? rowToRecord(data as ReadingRow) : null
}

export async function deleteCloudReading(id: string): Promise<void> {
  const client = await getSupabaseClient()
  if (!client || !currentUser) return

  const { error } = await client.from('readings').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

/**
 * 登录后把匿名期间存在本地的卦例补传上去。
 * 逐条插入而非批量：某一条坏掉不该拖垮其余的。
 */
export async function syncLocalToCloud(): Promise<{ uploaded: number; failed: number }> {
  const client = await getSupabaseClient()
  if (!client || !currentUser) return { uploaded: 0, failed: 0 }

  const pending = getUnsyncedLocalRecords()
  if (!pending.length) return { uploaded: 0, failed: 0 }

  const uploadedIds: string[] = []
  let failed = 0
  for (const rec of pending) {
    try {
      await insertCloudReading(rec)
      uploadedIds.push(rec.id)
    } catch (err) {
      failed++
      console.error('upload reading failed:', err)
    }
  }
  if (uploadedIds.length) markLocalRecordsSynced(uploadedIds)
  track('history_synced', { uploaded: uploadedIds.length, failed })
  return { uploaded: uploadedIds.length, failed }
}

// ============================================================
// 统一入口：上层不关心记录存在本地还是云端
// ============================================================

export async function persistReading(rec: ReadingRecord): Promise<ReadingRecord> {
  // 先落本地，保证断网或云端故障时记录不丢
  saveLocalRecord(rec)
  if (!isCloudConfigured() || !currentUser) return rec

  try {
    const saved = await insertCloudReading(rec)
    // 没抛错就说明云端已经有这条了（本次插入的，或先前已传过撞了幂等键），
    // 两种情况都该标记为已同步，否则会被无限重传
    markLocalRecordsSynced([rec.id])
    return saved || rec
  } catch (err) {
    // 留在本地当待同步，下次登录或同步时补传
    console.error('cloud save failed, kept locally:', err)
    return rec
  }
}

export async function listReadings(): Promise<{
  records: ReadingRecord[]
  source: 'cloud' | 'local'
}> {
  if (isCloudConfigured() && currentUser) {
    try {
      const cloud = await fetchCloudReadings()
      if (cloud) return { records: cloud, source: 'cloud' }
    } catch (err) {
      console.error('cloud fetch failed, falling back to local:', err)
    }
  }
  return { records: loadLocalHistory(), source: 'local' }
}

/**
 * 接受完整记录。云端记录的 id 与本机副本的 id 不同，
 * 只删一边的话，下次断网回退到本地历史时被删的卦例会「复活」
 */
export async function removeReading(rec: ReadingRecord): Promise<void> {
  deleteLocalRecord(rec.id)
  if (rec.clientId && rec.clientId !== rec.id) deleteLocalRecord(rec.clientId)

  if (isCloudConfigured() && currentUser) {
    try {
      await deleteCloudReading(rec.id)
    } catch (err) {
      console.error('cloud delete failed:', err)
    }
  }
}
