// ============================================================
// 构建时把服务器环境变量注入 src/lib/config.ts
// ============================================================
//
// 由 package.json 的 build 脚本在 vite build 之前执行：
//   "build": "node scripts/build-config.mjs && vite build"
//
// Vercel 项目设置 → Build & Development Settings：
//   Build Command:    npm run build
//   Output Directory: dist
//
// 环境变量在 Vercel 项目设置 → Environment Variables 里配置：
//   POSTHOG_KEY        PostHog Project API Key（phc_ 开头）
//   POSTHOG_UI_HOST    可选，欧盟区填 https://eu.posthog.com
//   SUPABASE_URL       https://xxxxxxxx.supabase.co
//   SUPABASE_ANON_KEY  anon / public key —— 不是 service_role key
//   ANALYTICS_HOSTS    可选，逗号分隔；默认取 Vercel 生产域名
//   CLOUD_HOSTS        可选，同上
//
// 本脚本只写「设计上就公开」的前端标识。若检测到 service_role key
// 或模型 API Key 被误配到这些变量上，直接让构建失败。

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'src', 'lib', 'config.ts');

const env = process.env;

// ------------------------------------------------------------
// 防呆：绝不能被注入前端的东西
// ------------------------------------------------------------

function assertNotSecret(name, value) {
  if (!value) return;

  // Supabase 的 key 是 JWT，role 字段直接写在 payload 里，解出来看一眼
  if (/^ey[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\./.test(value)) {
    try {
      const payload = JSON.parse(Buffer.from(value.split('.')[1], 'base64url').toString());
      if (payload.role && payload.role !== 'anon') {
        fail(`${name} 是 role="${payload.role}" 的 key。只有 anon key 能进前端，` +
             `service_role key 绕过 RLS，等同数据库管理员权限。`);
      }
    } catch (err) {
      if (err.__configFail) throw err;
      // 解不开就当作普通字符串放行，后面的模式匹配还会再筛一道
    }
  }

  // 新版 Supabase 的 secret key 前缀
  if (/^sb_secret_/.test(value)) {
    fail(`${name} 看起来是 Supabase secret key，不能进前端。`);
  }

  // 常见模型厂商的私钥前缀
  const modelKeyPatterns = [
    [/^sk-ant-/, 'Anthropic'],
    [/^sk-proj-/, 'OpenAI'],
    [/^sk-[A-Za-z0-9]{20,}/, 'OpenAI'],
    [/^gsk_/, 'Groq'],
    [/^AIza[A-Za-z0-9_-]{30,}/, 'Google'],
  ];
  for (const [pattern, vendor] of modelKeyPatterns) {
    if (pattern.test(value)) {
      fail(`${name} 看起来是 ${vendor} 的 API Key。模型 key 绝不能进前端 —— ` +
           `用户的 key 只存在各自浏览器的 localStorage 里。`);
    }
  }
}

function fail(message) {
  const err = new Error(message);
  err.__configFail = true;
  console.error(`\n❌ 构建中止：${message}\n`);
  process.exit(1);
}

// ------------------------------------------------------------
// 取值
// ------------------------------------------------------------

function readEnv(name) {
  const value = (env[name] || '').trim();
  assertNotSecret(name, value);
  return value;
}

function readHosts(name, fallbackHosts) {
  const raw = (env[name] || '').trim();
  if (!raw) return fallbackHosts;
  return raw.split(',').map(s => s.trim()).filter(Boolean);
}

const posthogKey = readEnv('POSTHOG_KEY');
const posthogUiHost = readEnv('POSTHOG_UI_HOST') || 'https://us.posthog.com';
const supabaseUrl = readEnv('SUPABASE_URL');
const supabaseAnonKey = readEnv('SUPABASE_ANON_KEY');

if (posthogKey && !posthogKey.startsWith('phc_')) {
  fail('POSTHOG_KEY 应以 phc_ 开头（Project API Key）。personal API key 不能进前端。');
}
if (supabaseUrl && !/^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/.test(supabaseUrl)) {
  fail(`SUPABASE_URL 格式不对：${supabaseUrl}`);
}

// Vercel 会自动注入生产域名，默认拿它当白名单，省得再配一遍
const defaultHosts = [env.VERCEL_PROJECT_PRODUCTION_URL, env.VERCEL_URL]
  .filter(Boolean)
  .map(h => h.replace(/^https?:\/\//, ''));

const analyticsHosts = readHosts('ANALYTICS_HOSTS', defaultHosts);
const cloudHosts = readHosts('CLOUD_HOSTS', defaultHosts);

// 第三方登录。列进来的 provider 必须先在 Supabase 控制台配好
const SUPPORTED_OAUTH = ['google', 'github', 'apple', 'azure', 'discord', 'twitter'];
const oauthProviders = readHosts('OAUTH_PROVIDERS', ['google']).map(p => p.toLowerCase());
for (const p of oauthProviders) {
  if (!SUPPORTED_OAUTH.includes(p)) {
    fail(`OAUTH_PROVIDERS 里的 "${p}" 不在支持列表中：${SUPPORTED_OAUTH.join(', ')}`);
  }
}

// ------------------------------------------------------------
// 生成
// ------------------------------------------------------------

const s = v => JSON.stringify(v);

const output = `// ============================================================
// 六爻排盘 - 部署配置（自动生成，请勿手工编辑）
// ============================================================
//
// 由 scripts/build-config.mjs 在构建时从环境变量生成。
// 仓库里的版本保持空值，真实值只存在于部署环境。
//
// 这里的值会出现在浏览器中 —— 它们是前端 SDK 的公开凭据。
// Supabase anon key 的权限完全由 RLS 策略约束；PostHog key 只能写不能读。

export const POSTHOG_KEY = ${s(posthogKey)}
export const POSTHOG_HOST = '/ingest'
export const POSTHOG_UI_HOST = ${s(posthogUiHost)}

export const SUPABASE_URL = ${s(supabaseUrl)}
export const SUPABASE_ANON_KEY = ${s(supabaseAnonKey)}
export const OAUTH_PROVIDERS: string[] = ${s(oauthProviders)}

export const ANALYTICS_HOSTS: string[] = ${s(analyticsHosts)}
export const CLOUD_HOSTS: string[] = ${s(cloudHosts)}

export function isHostAllowed(hosts: string[]): boolean {
  return (
    Array.isArray(hosts) &&
    typeof location !== 'undefined' &&
    hosts.includes(location.hostname)
  )
}
`;

writeFileSync(OUT, output, 'utf8');

console.log('✅ src/lib/config.ts 已生成');
console.log(`   统计：${posthogKey ? '启用' : '关闭（POSTHOG_KEY 未设置）'}`);
console.log(`   账户：${supabaseUrl && supabaseAnonKey ? '启用' : '关闭（SUPABASE_* 未设置）'}`);
console.log(`   第三方登录：${oauthProviders.length ? oauthProviders.join(', ') : '（无，仅邮箱）'}`);
console.log(`   统计域名白名单：${analyticsHosts.length ? analyticsHosts.join(', ') : '（空 → 全站关闭）'}`);
console.log(`   账户域名白名单：${cloudHosts.length ? cloudHosts.join(', ') : '（空 → 全站关闭）'}`);
