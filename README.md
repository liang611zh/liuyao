# 六爻排盘

基于传统纳甲筮法的六爻排盘 Web 应用，使用五帝钱（铜钱）起卦。

🔗 [**Online Demo**](https://liuyao-kappa.vercel.app/)

## 功能

- **随机起卦** — 模拟掷三枚铜钱 6 次，含翻转动画
- **手动录入** — 逐爻点选铜钱正反面，支持实际摇卦记录
- **纳甲排盘** — 自动计算本卦/变卦、世应、六亲、六神、纳甲干支、日建与旬空
- **AI 解卦** — 支持多模型（Gemini / Groq / DeepSeek / OpenAI / Claude），流式输出解读
- **复制卦象** — 一键复制排盘结果，可粘贴到任意 AI 对话中手动解读
- **保存结果图** — 截图下载排盘结果
- **卦例历史** — 起卦自动存档，可随时翻回重看；登录后跨设备同步
- **双主题** — 宣纸（亮）与夜观天象（暗）两套中式配色，默认暗色
- **多语言** — 简中 / 繁中 / 英 / 日 / 韩，切换即时生效，不刷新页面

### 排盘约定

- **纳甲**：内卦（初/二/三爻）与外卦（四/五/上爻）分别取用各自的干支，两者不同
- **六神**：甲乙起青龙、丙丁起朱雀、戊起勾陈、己起螣蛇、庚辛起白虎、壬癸起玄武
- **换日**：采用「晚子时」派，23:00 起即换日干支（改 `src/lib/paipan.ts` 的 `LATE_ZI_ADVANCES_DAY` 可切回按日历日）
- **旬空**：由六十甲子日序推出，甲子旬空戌亥、甲戌旬空申酉，依此类推
- **尚未实现**：月建（需节气历）、伏神。AI prompt 中已注明未推月建

## 测试

```bash
npm test          # 排盘正确性（vitest，91 项）
npm run typecheck # TypeScript 严格模式
```

覆盖八卦位序、64 卦查表往返、八纯卦纳甲、六神起例、干支历与旬空，
并拿传统标准答案逐爻核对一盘完整排盘；另外覆盖卦例记录的序列化往返、
时区无关性、五种语言的词条完整性与 AI 提供商配置。
改动 `src/lib/data.ts` 或 `src/lib/paipan.ts` 前请先确认全绿。

测试直接在 node 里 import `src/lib/`，不拖渲染环境 —— 这也是那一层
刻意保持框架无关的原因，CI 里有断言守着它不许 import React。

```bash
node scripts/scan-secrets.mjs   # 扫描仓库里有没有误提交的凭据
```

## 截图

> 欢迎提交截图 PR

## 技术栈

- [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) + [Vite](https://vite.dev/)
- [Tailwind CSS v4](https://tailwindcss.com/) + [shadcn/ui](https://ui.shadcn.com/)（Radix 无样式组件 + 自定义中式主题）
- 移动端优先响应式设计，`max-width: 28rem`

按需加载：Supabase SDK 与 html2canvas-pro 都走动态 `import`，Vite 切成独立 chunk。
没登录、没点「保存结果图」的访客一个字节都不会下载。

排盘逻辑（`src/lib/`）与 UI 层严格分离，前者是不依赖任何框架的纯函数。

## 本地运行

```bash
npm install
npm run dev
```

不配任何环境变量也能完整使用，只是统计和账户功能关闭、卦例存本机 localStorage。

## AI 解卦配置

支持两种方式使用 AI 解读卦象：

### 方式一：复制粘贴（无需配置）
点击「复制卦象结果」，粘贴到 ChatGPT / Claude / 豆包 / Kimi 等任意 AI 对话中。

### 方式二：内置 AI 解读（需 API Key）
点击结果页的 ⚙ 按钮配置 API Key，支持：

| 提供商 | 费用 | 说明 |
|--------|------|------|
| Gemini | 免费 | 推荐，Google AI 免费额度充足 |
| Groq | 免费 | 使用 Llama 等开源模型 |
| DeepSeek | 极低价 | 国产大模型 |
| OpenAI | 付费 | GPT-4o-mini / GPT-4o |
| Claude | 付费 | Anthropic Claude |
| 自定义 | - | 任意 OpenAI 兼容端点 |

API Key 仅保存在浏览器本地（localStorage），不会上传到任何服务器。

## 卦例历史与账户

起卦完成会**自动存档**，点顶栏「历史」即可翻回重看，点任意一条重新排盘并交给 AI 解读。

- **未登录**：记录存在本机浏览器（localStorage），最多 50 条，清除浏览器数据会一并丢失
- **已登录**：记录存到你的账户，跨设备可见；登录时会把本机攒下的记录自动补传上去

登录支持两种方式：

- **第三方账号（SSO）** — 一次点击。默认启用 Google，可用环境变量 `OAUTH_PROVIDERS`
  改成 `google,github` 等组合（支持 google / github / apple / azure / discord / twitter）
- **邮箱免密（Magic Link）** — 填邮箱 → 收一封带登录链接的邮件 → 点开即登录，不用记密码

同一邮箱用不同方式登录，Supabase 会自动关联到同一个账号，历史不会因为换登录方式而丢失。

> ⚠️ **两条路都得留着，别只上 SSO。**
> Google 在中国大陆无法访问，而本应用默认语言是简体中文，主力用户多在墙内。
> GitHub 在墙内基本可达，可作为补充。
>
> ⚠️ **上生产前必须配自建 SMTP。**
> Supabase 内置的邮件服务有严格的每小时发信限额，官方明确说明仅供测试用。
> 只靠它的话，用户一多 Magic Link 就会发不出去。在 Supabase 控制台
> Authentication → SMTP Settings 接入 Resend / SendGrid 等服务即可。

记录里存的是**起卦时的原始事实**——六个爻值加上当时的日干支、时辰、旬空文本，
卦名/纳甲/六亲/六神都在读取时重算。这么设计有两个原因：排盘逻辑还会修（本项目就修过
三处错误），存派生结果等于把错误冻进数据库；而 `timestamptz` 按时间戳重算干支会随
查看设备的时区漂移，北京起的卦在纽约打开会串到前一天。

## 隐私

| 数据 | 存在哪 | 谁能看到 |
|------|--------|----------|
| 模型 API Key | 你自己浏览器的 localStorage | 只有你。不经过任何服务器 |
| 占问之事、卦例 | 未登录在本机；登录后在你账户下 | 只有你。数据库 RLS 限制每个账号只能读写自己的行 |
| AI 解读正文 | 不保存 | — |
| 匿名统计事件 | PostHog | 见下 |

**统计不采集**：占问之事的文本内容（只记录是否填写）、任何 API Key 或端点地址、
AI 解读的正文（只记录字数与耗时）。`autocapture` 与 session recording 全程关闭，
浏览器开启 Do Not Track 时根本不加载。不想参与可点起始页底部的「不参与匿名统计」，
或访问 `?noanalytics=1`。CI 里有断言守着这几条不被改回去。

## 部署配置

**仓库里不含任何 key。** `src/lib/config.ts` 的值全为空，因此 clone 下来 `npm run dev` 就能用，
只是统计和账户功能关闭，卦例存本机。

真实值放在部署环境的环境变量里，构建时由 `scripts/build-config.mjs` 注入：

| 环境变量 | 说明 |
|----------|------|
| `POSTHOG_KEY` | PostHog Project API Key（`phc_` 开头） |
| `POSTHOG_UI_HOST` | 可选，欧盟区填 `https://eu.posthog.com` |
| `SUPABASE_URL` | `https://xxxxxxxx.supabase.co` |
| `SUPABASE_ANON_KEY` | anon / public key —— **不是** service_role key |
| `OAUTH_PROVIDERS` | 可选，逗号分隔，默认 `google`；留空则只保留邮箱登录 |
| `ANALYTICS_HOSTS` | 可选，逗号分隔；默认取 Vercel 生产域名 |
| `CLOUD_HOSTS` | 可选，同上 |

Vercel 项目设置里 Build Command 填 `npm run build`，Output Directory 填 `dist`
（`vercel.json` 已配好；`npm run build` 会先跑 `build-config.mjs` 生成配置再交给 Vite）。
Supabase 侧还需要：

1. SQL Editor 执行 `supabase/schema.sql` 建表并开启 RLS
2. Authentication → URL Configuration → Redirect URLs 加上本站域名
3. Authentication → Providers 开启并配置要用的 SSO（Google 需在 Google Cloud Console
   建 OAuth 客户端，把 Supabase 给的回调地址填进去）
4. Authentication → SMTP Settings 接入自己的邮件服务（见上方警告）

域名白名单的作用是：别人 fork 部署后，统计不会打进你的 PostHog，登录也不会连到你的
Supabase。本地开发（localhost）不在白名单内，调试不会污染生产数据。

### 关于「不暴露」的边界

`POSTHOG_KEY` 和 `SUPABASE_ANON_KEY` **最终一定会出现在浏览器里**，访客打开 DevTools
就能看到——它们是前端 SDK 的凭据，换成环境变量也一样。环境变量解决的是「不进 git 仓库」，
不是「不进浏览器」。真正的安全边界是：Supabase anon key 的权限完全由
`supabase/schema.sql` 里的 RLS 策略约束，拿到它也只能读写自己那一行；PostHog key 只能
写事件、读不了任何已有数据。

因此以下东西绝不能走这条路，它们连浏览器都不能到：

- Supabase `service_role` key（绕过 RLS，等同数据库管理员）
- 任何模型厂商的 API Key
- 数据库连接串、SMTP 密码

`scripts/build-config.mjs` 会在构建时拦截误配到环境变量上的私钥（解 JWT 看 role、
匹配各家私钥前缀），`scripts/scan-secrets.mjs` 再扫一遍仓库里所有跟踪文件，两者都接在 CI 上。
凭据一旦提交就会永久留在 git 历史里，删文件没用——只能去对应平台作废重发。

## 项目结构

```
index.html                    — Vite 入口
src/main.tsx                  — 应用挂载、主题与统计初始化
src/App.tsx                   — 五个界面的路由与起卦状态机
src/index.css                 — 设计令牌（宣纸/夜观天象两套皮）、铜钱动画、回纹
src/lib/                      — 纯逻辑层，不依赖 React，测试直接 import
  config.ts                   — 部署配置（仓库内为空，构建时注入）
  data.ts                     — 八卦、六十四卦、八宫、纳甲、六神等静态表
  paipan.ts                   — 干支历、旬空、摇卦、纳甲、六亲、世应
  i18n.ts                     — 多语言词典与 t()
  history.ts                  — 卦例记录格式、本地历史、从记录重建排盘
  supabase.ts                 — 账户与云端同步（默认关闭）
  analytics.ts                — 匿名统计（PostHog，默认关闭）
  ai.ts                       — AI 解卦（多模型适配、SSE 流式解析）
src/components/ui/            — shadcn/ui 组件（npx shadcn add 生成）
src/components/               — 业务组件（铜钱、爻线、排盘表、弹窗等）
src/components/screens/       — 起始页 / 摇卦 / 手动录入 / 卦例历史 / 排盘结果
src/hooks/                    — useLang、useAccount
supabase/schema.sql           — 数据库表结构与 RLS 策略
scripts/build-config.mjs      — 构建时从环境变量生成 src/lib/config.ts
scripts/scan-secrets.mjs      — 凭据泄露扫描
test/paipan.test.ts           — 排盘与记录正确性测试（vitest）
vercel.json                   — 构建命令与 PostHog 反向代理
```

## 许可证

[MIT](LICENSE)
