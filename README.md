# 六爻排盘

基于传统纳甲筮法的六爻排盘 Web 应用，使用五帝钱（铜钱）起卦。

🔗 **在线体验**：[liuyao-jo87x0ou6-liang611zhs-projects.vercel.app](https://liuyao-jo87x0ou6-liang611zhs-projects.vercel.app/)

## 功能

- **随机起卦** — 模拟掷三枚铜钱 6 次，含翻转动画
- **手动录入** — 逐爻点选铜钱正反面，支持实际摇卦记录
- **纳甲排盘** — 自动计算本卦/变卦、世应、六亲、六神、地支五行
- **AI 解卦** — 支持多模型（Gemini / Groq / DeepSeek / OpenAI / Claude），流式输出解读
- **复制卦象** — 一键复制排盘结果，可粘贴到任意 AI 对话中手动解读
- **保存结果图** — 截图下载排盘结果

## 截图

> 欢迎提交截图 PR

## 技术栈

- 纯 HTML / CSS / JavaScript，无框架依赖
- 外部依赖仅 [html2canvas](https://html2canvas.hertzen.com/)（CDN 加载）
- 移动端优先响应式设计

## 本地运行

无需安装任何依赖，直接打开即可：

```bash
# 方式一：直接打开
open index.html

# 方式二：本地服务器（推荐，避免 CORS 问题）
npx serve .
# 或
python3 -m http.server 8000
```

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

## 项目结构

```
index.html        — 单页应用入口
css/style.css     — 样式（仿古风格、铜钱动画、响应式）
js/data.js        — 数据层（八卦、六十四卦、八宫、纳甲、六神等）
js/app.js         — 应用逻辑（干支历、摇卦算法、排盘计算、UI）
js/ai.js          — AI 解卦模块（多模型适配、流式输出）
```

## 许可证

[MIT](LICENSE)
