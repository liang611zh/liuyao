// ============================================================
// 六爻排盘 - 账户与云端同步 (Supabase)
// ============================================================
//
// SUPABASE_URL / SUPABASE_ANON_KEY / CLOUD_HOSTS 定义在 js/config.js，
// 由构建脚本从服务器环境变量注入。未填或域名不在白名单时整个模块保持关闭：
// 不加载 SDK、不发任何请求，卦例历史自动降级到 localStorage。
// 自建部署不接 Supabase 也能完整使用。
//
// 建库：在 Supabase 控制台 SQL Editor 里执行 supabase/schema.sql
// 邮箱登录：控制台 Authentication → 把本站域名加进 Redirect URLs

// UMD 构建，暴露 window.supabase.createClient，无需打包工具
const SUPABASE_SDK_SRC = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js';

let sbClient = null;
let sbSdkPromise = null;
let currentUser = null;
let currentProfile = null;
// UI 订阅登录状态变化
const accountListeners = [];

function isCloudConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY && isHostAllowed(CLOUD_HOSTS));
}

function getCurrentUser() {
  return currentUser;
}

function getCurrentProfile() {
  return currentProfile;
}

// 显示用名字：昵称 → 邮箱 → 用户 id
function getDisplayName() {
  if (currentProfile && currentProfile.nickname) return currentProfile.nickname;
  if (currentUser) return currentUser.email || currentUser.id;
  return '';
}

function onAccountChange(fn) {
  accountListeners.push(fn);
}

function notifyAccountChange() {
  for (const fn of accountListeners) {
    try { fn(currentUser); } catch (err) { console.error('account listener failed:', err); }
  }
}

// ============================================================
// SDK 按需加载
// ============================================================

// Supabase SDK 约 120KB。只在真正需要时才拉：
// 已有会话、刚从登录邮件跳回来、或用户主动点了账户/历史。
function hasStoredSession() {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && /^sb-.*-auth-token$/.test(key)) return true;
    }
  } catch { /* 隐私模式下读不到，当作没有 */ }
  return false;
}

function isAuthCallback() {
  return location.hash.includes('access_token') || /[?&]code=/.test(location.search);
}

function loadSupabaseSdk() {
  if (window.supabase && window.supabase.createClient) return Promise.resolve(window.supabase);
  if (sbSdkPromise) return sbSdkPromise;
  sbSdkPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SUPABASE_SDK_SRC;
    script.async = true;
    script.onload = () => {
      if (window.supabase && window.supabase.createClient) resolve(window.supabase);
      else reject(new Error('Supabase SDK loaded but createClient missing'));
    };
    script.onerror = () => {
      sbSdkPromise = null;
      reject(new Error('Supabase SDK load failed'));
    };
    document.head.appendChild(script);
  });
  return sbSdkPromise;
}

async function getSupabaseClient() {
  if (!isCloudConfigured()) return null;
  if (sbClient) return sbClient;

  const sdk = await loadSupabaseSdk();
  sbClient = sdk.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // 从登录邮件跳回来时自动把 URL 里的凭据换成会话
      detectSessionInUrl: true,
    },
  });

  sbClient.auth.onAuthStateChange((event, session) => {
    const prevUser = currentUser;
    currentUser = session ? session.user : null;

    if (currentUser && !prevUser) {
      identifyUser(currentUser.id);
      // 登录后把匿名期间攒下的本地卦例搬上云
      syncLocalToCloud().catch(err => console.error('sync failed:', err));
    } else if (!currentUser && prevUser) {
      currentProfile = null;
      resetAnalyticsIdentity();
    }
    notifyAccountChange();
  });

  const { data } = await sbClient.auth.getSession();
  currentUser = data && data.session ? data.session.user : null;
  if (currentUser) identifyUser(currentUser.id);
  notifyAccountChange();

  return sbClient;
}

// 页面启动时调用：只有确实可能已登录才会真的加载 SDK
async function initCloudAccount() {
  if (!isCloudConfigured()) return;
  if (!hasStoredSession() && !isAuthCallback()) return;
  try {
    await getSupabaseClient();
    // 登录回调的凭据已换成会话，把它从地址栏抹掉，避免被复制分享出去
    if (isAuthCallback()) {
      history.replaceState(null, '', location.pathname);
    }
  } catch (err) {
    console.error('Supabase init failed:', err);
  }
}

// ============================================================
// 登录 / 登出
// ============================================================

// 邮箱免密登录：发一封含登录链接的邮件，点开即登录，不用记密码
async function signInWithEmail(email) {
  const client = await getSupabaseClient();
  if (!client) throw new Error(t('account_error_not_configured'));

  const { error } = await client.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: location.origin + location.pathname },
  });
  if (error) throw new Error(error.message);
  track('account_magic_link_sent');
}

// 第三方登录的展示名。品牌名不翻译，因此不走 i18n
const OAUTH_PROVIDER_NAMES = {
  google: 'Google',
  github: 'GitHub',
  apple: 'Apple',
  azure: 'Microsoft',
  discord: 'Discord',
  twitter: 'X',
};

function getOAuthProviders() {
  if (!isCloudConfigured()) return [];
  return (OAUTH_PROVIDERS || []).filter(p => OAUTH_PROVIDER_NAMES[p]);
}

function getOAuthProviderName(provider) {
  return OAUTH_PROVIDER_NAMES[provider] || provider;
}

// 跳转到第三方授权页。回来时 detectSessionInUrl 会把凭据换成会话，
// 同邮箱的账号 Supabase 会自动关联到同一个用户，不会因为换了登录方式就丢历史。
async function signInWithOAuth(provider) {
  const client = await getSupabaseClient();
  if (!client) throw new Error(t('account_error_not_configured'));

  track('account_oauth_started', { provider });
  const { error } = await client.auth.signInWithOAuth({
    provider,
    options: { redirectTo: location.origin + location.pathname },
  });
  if (error) throw new Error(error.message);
}

async function signOut() {
  const client = await getSupabaseClient();
  if (!client) return;
  await client.auth.signOut();
  currentUser = null;
  currentProfile = null;
  resetAnalyticsIdentity();
  notifyAccountChange();
  track('account_signed_out');
}

// ============================================================
// 用户资料
// ============================================================
//
// 用户本身由 Supabase Auth 存在 auth.users，前端读不到那张表，
// 只能通过 auth.getUser() 拿自己那条。昵称、头像这类应用字段放在
// public.profiles，注册时由数据库触发器自动建档。

async function fetchProfile() {
  const client = await getSupabaseClient();
  if (!client || !currentUser) return null;

  const { data, error } = await client
    .from('profiles')
    .select('id, email, nickname, avatar_url')
    .eq('id', currentUser.id)
    .maybeSingle();
  if (error) throw new Error(error.message);

  currentProfile = data;
  return data;
}

// 只有 nickname 一列被授予 update 权限（见 schema.sql 的列级 grant），
// 改 email 或 avatar_url 会被数据库直接拒绝
async function updateNickname(nickname) {
  const client = await getSupabaseClient();
  if (!client || !currentUser) return null;

  const trimmed = (nickname || '').trim();
  const { data, error } = await client
    .from('profiles')
    .update({ nickname: trimmed || null })
    .eq('id', currentUser.id)
    .select('id, email, nickname, avatar_url')
    .maybeSingle();
  if (error) throw new Error(error.message);

  if (data) currentProfile = data;
  track('profile_nickname_updated');
  return currentProfile;
}

// ============================================================
// 卦例读写
// ============================================================

function recordToRow(rec) {
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
  };
}

function rowToRecord(row) {
  return {
    id: row.id,
    // 云端行的 id 是数据库生成的 uuid，与本机那份记录的 id 不同。
    // 带上 client_id 才能在删除云端记录时把本机的副本一并清掉
    clientId: row.client_id || null,
    castAt: row.cast_at,
    castAtLocal: row.cast_at_local,
    yaoValues: row.yao_values,
    dayGanzhi: row.day_ganzhi,
    shichen: row.shichen,
    xunKong: row.xun_kong,
    question: row.question || '',
    mode: row.mode,
    lang: row.lang,
    synced: true,
  };
}

async function fetchCloudReadings(limit = 100) {
  const client = await getSupabaseClient();
  if (!client || !currentUser) return null;

  const { data, error } = await client
    .from('readings')
    .select('*')
    .order('cast_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data.map(rowToRecord).filter(isValidRecord);
}

// 用 upsert + 忽略冲突，让「同一条本地记录被传两次」变成空操作。
// 冲突时不会返回行（on conflict do nothing），此时返回 null 表示「已经在云端了」。
async function insertCloudReading(rec) {
  const client = await getSupabaseClient();
  if (!client || !currentUser) return null;

  const { data, error } = await client
    .from('readings')
    .upsert(recordToRow(rec), { onConflict: 'user_id,client_id', ignoreDuplicates: true })
    .select()
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? rowToRecord(data) : null;
}

async function deleteCloudReading(id) {
  const client = await getSupabaseClient();
  if (!client || !currentUser) return;

  const { error } = await client.from('readings').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// 登录后把匿名期间存在本地的卦例补传上去。
// 逐条插入而非批量：某一条坏掉不该拖垮其余的。
async function syncLocalToCloud() {
  const client = await getSupabaseClient();
  if (!client || !currentUser) return { uploaded: 0, failed: 0 };

  const pending = getUnsyncedLocalRecords();
  if (!pending.length) return { uploaded: 0, failed: 0 };

  const uploadedIds = [];
  let failed = 0;
  for (const rec of pending) {
    try {
      await insertCloudReading(rec);
      uploadedIds.push(rec.id);
    } catch (err) {
      failed++;
      console.error('upload reading failed:', err);
    }
  }
  if (uploadedIds.length) markLocalRecordsSynced(uploadedIds);
  track('history_synced', { uploaded: uploadedIds.length, failed });
  return { uploaded: uploadedIds.length, failed };
}

// ============================================================
// 统一入口：上层不关心记录存在本地还是云端
// ============================================================

async function persistReading(rec) {
  // 先落本地，保证断网或云端故障时记录不丢
  saveLocalRecord(rec);
  if (!isCloudConfigured() || !currentUser) return rec;

  try {
    const saved = await insertCloudReading(rec);
    // 没抛错就说明云端已经有这条了（本次插入的，或先前已传过撞了幂等键），
    // 两种情况都该标记为已同步，否则会被无限重传
    markLocalRecordsSynced([rec.id]);
    return saved || rec;
  } catch (err) {
    // 留在本地当待同步，下次登录或同步时补传
    console.error('cloud save failed, kept locally:', err);
    return rec;
  }
}

async function listReadings() {
  if (isCloudConfigured() && currentUser) {
    try {
      const cloud = await fetchCloudReadings();
      if (cloud) return { records: cloud, source: 'cloud' };
    } catch (err) {
      console.error('cloud fetch failed, falling back to local:', err);
    }
  }
  return { records: loadLocalHistory(), source: 'local' };
}

// 接受完整记录（或裸 id）。云端记录的 id 与本机副本的 id 不同，
// 只删一边的话，下次断网回退到本地历史时被删的卦例会「复活」
async function removeReading(recOrId) {
  const isRecord = recOrId && typeof recOrId === 'object';
  const id = isRecord ? recOrId.id : recOrId;
  const clientId = isRecord ? recOrId.clientId : null;

  deleteLocalRecord(id);
  if (clientId && clientId !== id) deleteLocalRecord(clientId);

  if (isCloudConfigured() && currentUser) {
    try { await deleteCloudReading(id); } catch (err) { console.error('cloud delete failed:', err); }
  }
}
