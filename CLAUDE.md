# 六爻排盘 (Liu Yao Divination)

基于传统纳甲筮法的六爻排盘 Web 应用，使用五帝钱（铜钱）起卦。

## 项目结构

```
index.html            — 单页应用入口，四个界面（起始页/手动录入/摇卦/排盘结果）
css/style.css         — 仿古风格样式，铜钱动画，移动端响应式
js/data.js            — 数据层（八卦、六十四卦、八宫、纳甲、六神等）
js/app.js             — 应用逻辑（干支历、旬空、摇卦算法、排盘计算、UI渲染）
js/i18n.js            — 多语言支持（简中/繁中/英/日/韩）
js/ai.js              — AI 解卦模块（多模型适配、流式输出、API Key 管理）
js/analytics.js       — 匿名统计（PostHog，默认关闭）
js/config.js          — 部署配置（仓库内必须保持空值，构建时注入）
js/history.js         — 卦例记录层（记录格式、本地历史、从记录重建排盘）
js/supabase.js        — 账户与云端同步（默认关闭）
supabase/schema.sql   — 数据库表结构与 RLS 策略
scripts/build-config.mjs  — 构建时从环境变量生成 js/config.js
scripts/scan-secrets.mjs  — 凭据泄露扫描
test/paipan.test.js   — 排盘与记录正确性测试（零依赖，node test/paipan.test.js）
```

## 技术栈

- 纯 HTML/CSS/JavaScript，无框架
- 外部依赖：html2canvas（CDN，用于截图保存）
- 移动端优先设计，max-width: 480px

## 核心概念

- **爻值**：三枚铜钱掷出结果 — 6(老阴)、7(少阳)、8(少阴)、9(老阳)
- **纳甲**：每爻配天干地支。**内卦（初/二/三爻）与外卦（四/五/上爻）所纳干支不同**，
  必须分别查 `NAJIA_INNER`/`NAJIA_OUTER`，不可共用一张表
- **六亲**：根据卦宫五行与各爻五行的生克关系确定（父母/兄弟/子孙/妻财/官鬼）
- **六神**：由日天干决定起始 — 甲乙青龙、丙丁朱雀、戊勾陈、己螣蛇、庚辛白虎、壬癸玄武
- **世应**：由卦在八宫中的序号决定
- **旬空**：由六十甲子日序推出本旬无干可配的两支

## 开发注意事项

- 脚本加载顺序：config.js → analytics.js → i18n.js → data.js → history.js → supabase.js
  → ai.js → app.js（后者依赖前者的全局变量；所有文件共用一个全局词法作用域，
  同名 `const` 会在运行时直接抛错，新增常量前先确认没重名）
- 多语言：用 `t('key')` 获取翻译，`data-i18n` 属性用于静态 HTML 元素。
  `t()` 用 `in` 判断而非 `||`，因为有条目（如 zh-CN 的 `ai_prompt_lang`）合法取值就是空字符串
- **卦的二进制表示一律从下到上**（index 0 = 初爻，index 5 = 上爻）。
  `TRIGRAMS` 的 key 也遵此约定：震 ☳ = `'100'`，巽 ☴ = `'011'`。
  写反了不会报错——反转在八卦上是双射，查表照样查得到，只是查成了另一个卦
- 干支历以 2000-01-07（甲子日）为参考基准推算；23:00 起换日（`LATE_ZI_ADVANCES_DAY`）
- 起卦时刻在点「起卦」那一刻快照进 `state.timeInfo`，排盘全程以此为准，不要重新取 `new Date()`
- CSS 使用 CSS 变量（`--bg-color`, `--accent-red` 等），便于主题调整
- **改动 `js/data.js` 或排盘逻辑后必须跑 `node test/paipan.test.js`**

## 开源仓库的凭据纪律

本仓库公开。`js/config.js` 在仓库里**必须保持空值**，真实 key 由
`scripts/build-config.mjs` 在部署构建时从环境变量注入（CI 有断言守着）。

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
且按 `timestamptz` 重算干支会随查看设备的时区漂移。测试里有时区无关性断言守着这条。

## 已知未实现

- 月建（需节气历）、伏神
- 变爻六亲目前按**变卦卦宫**推定；传统主流做法是按**本卦卦宫**推定，尚未改动
- 仓库里的 `六爻解卦入门教程.md` 是照着修复前的错误代码生成的，
  其中的纳甲、六神、实战例子均不可信，不要当作依据
