# 六爻排盘 (Liu Yao Divination)

基于传统纳甲筮法的六爻排盘 Web 应用，使用五帝钱（铜钱）起卦。

## 项目结构

```
index.html                — Vite 入口
src/main.tsx              — 挂载、主题（next-themes）、统计初始化
src/App.tsx               — 五个界面的切换与起卦状态机
src/index.css             — 设计令牌、铜钱动画、回纹、宣纸/星空底纹

src/lib/                  — 纯逻辑层：不依赖 React，测试直接在 node 里 import
  config.ts               — 部署配置（仓库内必须保持空值，构建时注入）
  data.ts                 — 八卦、六十四卦、八宫、纳甲、六神等静态表
  paipan.ts               — 干支历、旬空、摇卦、纳甲、六亲、六神、世应
  i18n.ts                 — 多语言词典与 t()（零依赖，见下）
  history.ts              — 卦例记录格式、本地历史、从记录重建排盘
  supabase.ts             — 账户与云端同步（默认关闭）
  analytics.ts            — 匿名统计（PostHog，默认关闭）
  ai.ts                   — AI 解卦（多模型适配、SSE 流式解析）

src/components/ui/        — shadcn/ui 组件，由 `npx shadcn@latest add <name>` 生成
src/components/           — 业务组件（coin、yao-glyph、paipan-table、各弹窗、chrome）
src/components/screens/   — start / throwing / manual / history / result
src/hooks/                — useLang、useAccount

supabase/schema.sql       — 数据库表结构与 RLS 策略
scripts/build-config.mjs  — 构建时从环境变量生成 src/lib/config.ts
scripts/scan-secrets.mjs  — 凭据泄露扫描
test/paipan.test.ts       — 排盘与记录正确性测试（vitest，91 项）
```

## 技术栈

React 19 + TypeScript + Vite + Tailwind CSS v4 + shadcn/ui（Radix）。
移动端优先，`max-width: 28rem`。

Supabase SDK 与 html2canvas-pro 走动态 `import`，Vite 自动切独立 chunk。

## 核心概念

- **爻值**：三枚铜钱掷出结果 — 6(老阴)、7(少阳)、8(少阴)、9(老阳)
- **纳甲**：每爻配天干地支。**内卦（初/二/三爻）与外卦（四/五/上爻）所纳干支不同**，
  必须分别查 `NAJIA_INNER`/`NAJIA_OUTER`，不可共用一张表
- **六亲**：根据卦宫五行与各爻五行的生克关系确定（父母/兄弟/子孙/妻财/官鬼）
- **六神**：由日天干决定起始 — 甲乙青龙、丙丁朱雀、戊勾陈、己螣蛇、庚辛白虎、壬癸玄武
- **世应**：由卦在八宫中的序号决定
- **旬空**：由六十甲子日序推出本旬无干可配的两支

## 开发注意事项

- **`src/lib/` 不许 import React。** 那层是纯逻辑，测试靠它能在 node 里直接跑；
  一旦混进 React，就得为几个断言拖进整个渲染环境。CI 有 grep 守着
- **卦的二进制表示一律从下到上**（index 0 = 初爻，index 5 = 上爻）。
  `TRIGRAMS` 的 key 也遵此约定：震 ☳ = `'100'`，巽 ☴ = `'011'`。
  写反了不会报错——反转在八卦上是双射，查表照样查得到，只是查成了另一个卦
- 干支历以 2000-01-07（甲子日）为参考基准推算；23:00 起换日（`LATE_ZI_ADVANCES_DAY`）
- 起卦时刻在点「起卦」那一刻快照进 `App` 的 `timeFacts`，排盘全程以此为准，
  **不要在渲染时重新取 `new Date()`**
- `TimeFacts` 与语言无关，`localizeTimeInfo()` 才套译文。切语言要重排干支，
  所以 `reading` 的 `useMemo` 依赖里必须带上 `lang`
- **改动 `src/lib/data.ts` 或 `src/lib/paipan.ts` 后必须跑 `npm test`**

### 多语言

- 用 `t('key')` 取译文，数组条目用 `tList()`，映射条目（`yao_labels`）用 `tMap()`
- `t()` 用 `in` 判断而非 `||`，因为有条目（如 zh-CN 的 `ai_prompt_lang`）合法取值
  就是空字符串。测试里有断言守着这条
- **切换语言不再整页 reload**。`currentLang` 变更后通知订阅者，组件用 `useLang()`
  订阅重渲染。因此**译文必须在 render 期间取，不能缓存进 state**
- `i18n.ts` 刻意零 import：analytics 要读当前语言，反过来 import 就成循环依赖了。
  语言切换的埋点由 `useLang()` 打
- 五种语言的词条集合必须完全一致，测试里有断言（漏翻会静默回落简中，很难发现）

### 主题与样式

- 两套皮都是中式的：亮色 = 宣纸，暗色 = 夜观天象。默认暗色
- 颜色一律在 `src/index.css` 的 `:root` / `.dark` 里**成对**定义，
  `@theme inline` 只做映射。shadcn 组件拿到的永远是语义名（primary / muted / border…），
  换皮不用改组件
- 卦名等固定汉字用毛笔体 `font-brush`；**会被翻译的标题**要走 `brushClass()`，
  它在非中日语言下回落宋体 —— Ma Shan Zheng 自带的拉丁字形是花体，套英文标题很怪
- 截图用 **html2canvas-pro**，不是原版 —— 原版不认 `oklch()`，整张图会渲染成黑块
- 新增 shadcn 组件用 `npx shadcn@latest add <name>`，不要手抄

## 开源仓库的凭据纪律

本仓库公开。`src/lib/config.ts` 在仓库里**必须保持空值**，真实 key 由
`scripts/build-config.mjs` 在部署构建时从环境变量注入（CI 有断言守着）。
注意 `npm run build` 会就地改写这个文件，本地构建后记得 `git checkout` 还原。

- ✅ 可以进浏览器：PostHog Project Key（只写不读）、Supabase anon key（受 RLS 约束）
- ❌ 绝不能进前端/仓库：Supabase `service_role` key、任何模型 API Key、数据库连接串

用户自己的模型 API Key 只存在各自浏览器的 localStorage，不经过服务器。
提交前可跑 `node scripts/scan-secrets.mjs`。凭据一旦进 git 历史，删文件无用，只能作废重发。

## 登录方式

SSO（默认 Google）与邮箱 Magic Link 并列，两条路都必须保留：

- Google 在中国大陆访问不了，而简中是本应用默认语言，主力用户在墙内 → 不能只留 SSO
- Supabase 内置邮件服务有严格限额且官方声明仅供测试 → 只留 Magic Link 会在用户量上来后发不出信

测试里有断言守着五种语言的邮箱登录文案都在。provider 列表由环境变量 `OAUTH_PROVIDERS` 控制。

## 卦例记录

记录只存原始事实：六个爻值 + 起卦时的干支文本快照。卦名、纳甲、六亲、六神一律读取时重算。
**不要改成存派生结果** —— 排盘逻辑会修，存下来的错误会永久留在库里；
且按 `timestamptz` 重算干支会随查看设备的时区漂移。测试里有时区无关性断言守着这条，
还配了一条对照组断言，防止「TZ 根本没生效」让那条测试变成摆设。

## 已知未实现

- 月建（需节气历）、伏神
- 变爻六亲目前按**变卦卦宫**推定；传统主流做法是按**本卦卦宫**推定，尚未改动
- `src/lib/ai.ts` 里各家的模型名单是 2025 年的，已经过时（gpt-4o、claude-sonnet-4 等），
  没有随本次重构一并更新
- 仓库里的 `六爻解卦入门教程.md` 是照着修复前的错误代码生成的，
  其中的纳甲、六神、实战例子均不可信，不要当作依据
