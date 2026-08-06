// ============================================================
// 六爻排盘 - 部署配置
// ============================================================
//
// ⚠️ 这个文件在部署构建时会被 scripts/build-config.mjs 整个覆盖。
//    不要在这里填真实的 key —— 仓库里这份必须保持空值。
//    真实值放在 Vercel 项目的 Environment Variables 里，构建时才注入。
//
// 保持空值意味着：clone 下来直接打开也能用，只是统计和账户功能关闭，
// 卦例存在本机 localStorage。
//
// ── 关于「暴露」的边界 ──
//
// 下面这些值最终一定会出现在浏览器里，访客打开 DevTools 就能看到。
// 这是前端 SDK 的固有性质，改用环境变量也不会变。
// 环境变量解决的是「不进 git 仓库」，不是「不进浏览器」。
//
// 真正的安全边界在别处：
//   · Supabase anon key —— 权限完全由数据库 RLS 策略约束，
//     拿到它也只能读写自己那一行。安全性来自 supabase/schema.sql 里的策略。
//   · PostHog Project Key —— 只能写入事件，读不了任何已有数据。
//
// 以下东西绝不能进入这个文件、这个仓库、或任何前端代码：
//   ✗ Supabase service_role key（绕过 RLS，等同数据库管理员）
//   ✗ OpenAI / Anthropic / Gemini / Groq / DeepSeek 等模型 API Key
//   ✗ 数据库连接串、SMTP 密码、任何 .env 文件
//
// 用户自己的模型 API Key 只存在各自浏览器的 localStorage，不经过服务器。
// build-config.mjs 会拦截误配到环境变量里的私钥，CI 也有一道 secret scan 兜底，
// 但那些是保险丝，不是许可证。

// ------------------------------------------------------------
// 匿名统计 (PostHog) —— 环境变量 POSTHOG_KEY
// ------------------------------------------------------------

// 留空 = 完全关闭统计，不加载 SDK、不发任何请求
const POSTHOG_KEY = '';

// 走同源反代（见 vercel.json），绕开广告拦截器对 posthog.com 的拦截
const POSTHOG_HOST = '/ingest';

// PostHog 控制台地址，仅用于 SDK 内的跳转链接。环境变量 POSTHOG_UI_HOST
const POSTHOG_UI_HOST = 'https://us.posthog.com';

// ------------------------------------------------------------
// 账户与云端卦例 (Supabase) —— 环境变量 SUPABASE_URL / SUPABASE_ANON_KEY
// ------------------------------------------------------------

// 留空 = 完全关闭账户功能，卦例只存本机 localStorage
const SUPABASE_URL = '';
const SUPABASE_ANON_KEY = '';

// 启用哪些第三方登录（环境变量 OAUTH_PROVIDERS，逗号分隔）。
// 列在这里的 provider 必须先在 Supabase 控制台 Authentication → Providers 里开启并配好，
// 否则按钮点下去会报错。
//
// ⚠️ Google 在中国大陆无法访问。本应用默认语言是简体中文，主力用户多在墙内，
//    因此邮箱 Magic Link 必须一并保留，不能只留 SSO。
//    GitHub 在墙内基本可达，可作为补充。
const OAUTH_PROVIDERS = ['google'];

// ------------------------------------------------------------
// 域名白名单
// ------------------------------------------------------------
//
// 别人 fork 部署后，统计不会打进你的 PostHog，登录也不会连到你的 Supabase。
// 构建时默认取 Vercel 的生产域名，可用环境变量 ANALYTICS_HOSTS / CLOUD_HOSTS
// 覆盖（逗号分隔）。

const ANALYTICS_HOSTS = [];
const CLOUD_HOSTS = [];

// ------------------------------------------------------------

// 本地开发（localhost / 127.0.0.1）不在白名单内，
// 因此调试时不会把测试数据打进生产项目
function isHostAllowed(hosts) {
  return Array.isArray(hosts) && hosts.includes(location.hostname);
}
