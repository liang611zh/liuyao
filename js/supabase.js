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
// UI 订阅登录状态变化
const accountListeners = [];

function isCloudConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY && isHostAllowed(CLOUD_HOSTS));
}

function getCurrentUser() {
  return currentUser;
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
  resetAnalyticsIdentity();
  notifyAccountChange();
  track('account_signed_out');
}

// ============================================================
// 卦例读写
// ============================================================

function recordToRow(rec) {
  return {
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

async function insertCloudReading(rec) {
  const client = await getSupabaseClient();
  if (!client || !currentUser) return null;

  const { data, error } = await client
    .from('readings')
    .insert({ ...recordToRow(rec), user_id: currentUser.id })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return rowToRecord(data);
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
    if (saved) markLocalRecordsSynced([rec.id]);
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

async function removeReading(id) {
  deleteLocalRecord(id);
  if (isCloudConfigured() && currentUser) {
    try { await deleteCloudReading(id); } catch (err) { console.error('cloud delete failed:', err); }
  }
}
