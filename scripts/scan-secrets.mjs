// ============================================================
// 泄露凭据扫描
// ============================================================
//
//   node scripts/scan-secrets.mjs
//
// 本项目开源，任何进入仓库的私钥都会永久留在 git 历史里 —— 删掉文件也没用，
// 只能作废重发。这个脚本是提交前的兜底闸门。
//
// 扫描 git 跟踪的所有文件。设计上刻意不匹配散文：
// 文档里写「不要提交 service_role key」是正确的做法，不该被判为泄露。
// 因此对 Supabase 的 JWT 直接解出 payload 看 role 字段，而不是搜关键词。

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// 这两个文件本身就是在讨论各种 key 的形状，跳过以免自我匹配
const SKIP_FILES = new Set([
  'scripts/scan-secrets.mjs',
  'scripts/build-config.mjs',
  '.github/workflows/ci.yml',
]);

const SKIP_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.pdf', '.woff', '.woff2'];

// 各家私钥的特征前缀。故意要求足够长的随机串，避免命中文档里的占位示例
const PATTERNS = [
  [/sk-ant-[A-Za-z0-9_-]{24,}/, 'Anthropic API key'],
  [/sk-proj-[A-Za-z0-9_-]{24,}/, 'OpenAI project key'],
  [/sk-[A-Za-z0-9]{32,}/, 'OpenAI API key'],
  [/gsk_[A-Za-z0-9]{32,}/, 'Groq API key'],
  [/AIza[A-Za-z0-9_-]{33,}/, 'Google API key'],
  [/sb_secret_[A-Za-z0-9_-]{16,}/, 'Supabase secret key'],
  [/xox[baprs]-[A-Za-z0-9-]{16,}/, 'Slack token'],
  [/gh[pousr]_[A-Za-z0-9]{30,}/, 'GitHub token'],
  [/postgres(?:ql)?:\/\/[^\s"'`]+:[^\s"'`]+@/, '数据库连接串（含密码）'],
  [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, '私钥文件内容'],
];

// JWT：三段 base64url。Supabase 的 anon / service_role key 都长这样
const JWT_PATTERN = /\bey[A-Za-z0-9_-]{10,}\.([A-Za-z0-9_-]{10,})\.[A-Za-z0-9_-]{10,}\b/g;

const findings = [];

function listTrackedFiles() {
  return execFileSync('git', ['ls-files'], { encoding: 'utf8' })
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean)
    .filter(f => !SKIP_FILES.has(f))
    .filter(f => !SKIP_EXTENSIONS.some(ext => f.toLowerCase().endsWith(ext)));
}

function scanJwts(file, content) {
  for (const match of content.matchAll(JWT_PATTERN)) {
    let payload;
    try {
      payload = JSON.parse(Buffer.from(match[1], 'base64url').toString('utf8'));
    } catch {
      continue; // 解不开就不是 JWT，交给上面的前缀规则去判
    }
    // anon key 是公开设计，允许出现；其余角色一律拦下
    if (payload && payload.role && payload.role !== 'anon') {
      findings.push({
        file,
        line: lineOf(content, match.index),
        what: `Supabase JWT，role="${payload.role}"（绕过 RLS，等同数据库管理员）`,
      });
    }
  }
}

function lineOf(content, index) {
  return content.slice(0, index).split('\n').length;
}

for (const file of listTrackedFiles()) {
  let content;
  try {
    content = readFileSync(file, 'utf8');
  } catch {
    continue; // 二进制或读不到，跳过
  }
  if (content.indexOf(String.fromCharCode(0)) !== -1) continue; // 二进制文件跳过

  for (const [pattern, what] of PATTERNS) {
    const match = pattern.exec(content);
    if (match) findings.push({ file, line: lineOf(content, match.index), what });
  }
  scanJwts(file, content);
}

if (findings.length) {
  console.error('\n❌ 仓库中发现疑似凭据：\n');
  for (const f of findings) {
    console.error(`   ${f.file}:${f.line}  ${f.what}`);
  }
  console.error('\n凭据一旦提交就会永久留在 git 历史里，删文件没用 —— 必须去对应平台作废重发。');
  console.error('前端需要的公开标识请走环境变量：scripts/build-config.mjs\n');
  process.exit(1);
}

console.log('✅ 未在跟踪文件中发现凭据');
