// ============================================================
// 六爻排盘 - AI 解卦模块
// ============================================================

const AI_PROVIDERS = {
  gemini: {
    name: 'Gemini',
    hint: '免费',
    models: ['gemini-2.0-flash', 'gemini-2.5-flash'],
    defaultModel: 'gemini-2.0-flash',
    type: 'gemini',
  },
  groq: {
    name: 'Groq',
    hint: '免费',
    models: ['llama-3.3-70b-versatile', 'mixtral-8x7b-32768'],
    defaultModel: 'llama-3.3-70b-versatile',
    type: 'openai',
    endpoint: 'https://api.groq.com/openai/v1/chat/completions',
  },
  deepseek: {
    name: 'DeepSeek',
    hint: '极低价',
    models: ['deepseek-chat'],
    defaultModel: 'deepseek-chat',
    type: 'openai',
    endpoint: 'https://api.deepseek.com/v1/chat/completions',
  },
  openai: {
    name: 'OpenAI',
    hint: '付费',
    models: ['gpt-4o-mini', 'gpt-4o'],
    defaultModel: 'gpt-4o-mini',
    type: 'openai',
    endpoint: 'https://api.openai.com/v1/chat/completions',
  },
  claude: {
    name: 'Claude',
    hint: '付费',
    models: ['claude-sonnet-4-20250514'],
    defaultModel: 'claude-sonnet-4-20250514',
    type: 'anthropic',
    endpoint: 'https://api.anthropic.com/v1/messages',
  },
  custom: {
    name: '自定义',
    hint: 'OpenAI 兼容',
    models: [],
    defaultModel: '',
    type: 'openai',
    endpoint: '',
  },
};

// ============================================================
// localStorage 配置管理
// ============================================================

function getAIConfig() {
  try {
    return JSON.parse(localStorage.getItem('liuyao_ai_config') || '{}');
  } catch { return {}; }
}

function saveAIConfig(cfg) {
  localStorage.setItem('liuyao_ai_config', JSON.stringify(cfg));
}

function getProviderConfig(providerId) {
  const cfg = getAIConfig();
  return cfg[providerId] || {};
}

function saveProviderConfig(providerId, data) {
  const cfg = getAIConfig();
  cfg[providerId] = { ...cfg[providerId], ...data };
  saveAIConfig(cfg);
}

function getLastProvider() {
  return localStorage.getItem('liuyao_last_provider') || '';
}

function setLastProvider(id) {
  localStorage.setItem('liuyao_last_provider', id);
}

// 获取已配置 key 的提供商列表
function getConfiguredProviders() {
  const cfg = getAIConfig();
  return Object.keys(AI_PROVIDERS).filter(id => {
    const pc = cfg[id];
    if (!pc || !pc.apiKey) return false;
    if (id === 'custom' && !pc.endpoint) return false;
    return true;
  });
}

// ============================================================
// Prompt 构建
// ============================================================

function buildDivinationPrompt(reading, question, dateInfo) {
  const { original, changed, lines, hasChanging } = reading;

  const posNames = ['初爻', '二爻', '三爻', '四爻', '五爻', '上爻'];
  let linesText = '';
  for (let i = 5; i >= 0; i--) {
    const l = lines[i];
    let line = `${posNames[i]}：${l.spirit} | ${l.relation} | ${l.branch}${l.branchElement}`;
    line += ` | ${l.isYang ? '阳' : '阴'}`;
    if (l.isChanging) line += `（动）`;
    if (l.isShi) line += ' [世]';
    if (l.isYing) line += ' [应]';
    if (l.isChanging && l.changedBranch) {
      line += ` → 变：${l.changedRelation} ${l.changedBranch}`;
    }
    linesText += line + '\n';
  }

  let prompt = `你是一位精通六爻纳甲筮法的易学大师，请根据以下排盘结果进行详细解读。

`;
  if (dateInfo) {
    prompt += `占卜时间：${dateInfo}\n`;
  }
  if (question) {
    prompt += `占问之事：${question}\n`;
  }
  prompt += `
本卦：${original.gua}（${original.palace}宫）
上卦：${original.upperTrigram}  下卦：${original.lowerTrigram}
`;
  if (hasChanging && changed) {
    prompt += `变卦：${changed.gua}（${changed.palace}宫）\n`;
  }
  prompt += `
六爻排盘（从上爻到初爻）：
${linesText}
请从以下方面进行解读：
1. 卦象总论：解释本卦含义${hasChanging ? '及变卦趋势' : ''}
2. 世应分析：世爻与应爻的状态
3. 用神分析：${question ? '根据所问之事确定用神并分析旺衰' : '分析各爻旺衰'}
4. 动爻分析：${hasChanging ? '分析动爻变化及其影响' : '本卦无动爻，分析静卦特点'}
5. 六神参考：结合六神辅助判断
6. 综合判断：给出明确的判断和建议

请用通俗易懂的语言解读，避免过于晦涩的术语。`;

  return prompt;
}

// ============================================================
// 流式 API 调用
// ============================================================

async function* streamOpenAI(endpoint, apiKey, model, prompt) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      stream: true,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`API 错误 (${res.status}): ${err}`);
  }
  yield* parseSSE(res.body, chunk => {
    if (chunk === '[DONE]') return null;
    try {
      const data = JSON.parse(chunk);
      return data.choices?.[0]?.delta?.content || '';
    } catch { return ''; }
  });
}

async function* streamAnthropic(endpoint, apiKey, model, prompt) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      stream: true,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`API 错误 (${res.status}): ${err}`);
  }
  yield* parseSSE(res.body, chunk => {
    try {
      const data = JSON.parse(chunk);
      if (data.type === 'content_block_delta') {
        return data.delta?.text || '';
      }
      return '';
    } catch { return ''; }
  });
}

async function* streamGemini(apiKey, model, prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`API 错误 (${res.status}): ${err}`);
  }
  yield* parseSSE(res.body, chunk => {
    try {
      const data = JSON.parse(chunk);
      return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    } catch { return ''; }
  });
}

// SSE 解析器
async function* parseSSE(body, extractContent) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(':')) continue;
        if (trimmed.startsWith('data: ')) {
          const data = trimmed.slice(6);
          const content = extractContent(data);
          if (content === null) return; // [DONE]
          if (content) yield content;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// 统一流式接口
async function* streamAI(providerId, prompt) {
  const provider = AI_PROVIDERS[providerId];
  const config = getProviderConfig(providerId);
  const apiKey = config.apiKey;
  const model = config.model || provider.defaultModel;

  if (!apiKey) throw new Error('请先配置 API Key');

  switch (provider.type) {
    case 'openai': {
      const endpoint = providerId === 'custom'
        ? config.endpoint
        : provider.endpoint;
      if (!endpoint) throw new Error('请配置 API 端点');
      yield* streamOpenAI(endpoint, apiKey, model, prompt);
      break;
    }
    case 'anthropic':
      yield* streamAnthropic(provider.endpoint, apiKey, model, prompt);
      break;
    case 'gemini':
      yield* streamGemini(apiKey, model, prompt);
      break;
    default:
      throw new Error('不支持的提供商类型');
  }
}

// ============================================================
// 设置弹窗逻辑
// ============================================================

function renderSettingsModal() {
  const modal = document.getElementById('settings-modal');
  const body = document.getElementById('settings-body');
  body.innerHTML = '';

  for (const [id, provider] of Object.entries(AI_PROVIDERS)) {
    const config = getProviderConfig(id);
    const section = document.createElement('div');
    section.className = 'settings-provider';

    let fieldsHTML = `
      <div class="settings-field">
        <label>API Key</label>
        <input type="password" id="cfg-${id}-key" value="${config.apiKey || ''}"
               placeholder="输入 ${provider.name} API Key" />
      </div>
      <div class="settings-field">
        <label>模型</label>
        <select id="cfg-${id}-model">
    `;
    const models = id === 'custom'
      ? (config.customModels || ['gpt-3.5-turbo'])
      : provider.models;
    for (const m of models) {
      const selected = (config.model || provider.defaultModel) === m ? 'selected' : '';
      fieldsHTML += `<option value="${m}" ${selected}>${m}</option>`;
    }
    fieldsHTML += '</select></div>';

    if (id === 'custom') {
      fieldsHTML += `
        <div class="settings-field">
          <label>端点 URL</label>
          <input type="url" id="cfg-custom-endpoint" value="${config.endpoint || ''}"
                 placeholder="https://your-api.com/v1/chat/completions" />
        </div>
        <div class="settings-field">
          <label>模型名称</label>
          <input type="text" id="cfg-custom-modelname" value="${config.customModelName || ''}"
                 placeholder="模型 ID" />
        </div>
      `;
    }

    section.innerHTML = `
      <div class="settings-provider-header">
        <span class="settings-provider-name">${provider.name}</span>
        <span class="settings-provider-hint">${provider.hint}</span>
      </div>
      ${fieldsHTML}
    `;
    body.appendChild(section);
  }

  modal.classList.remove('hidden');
}

function saveSettings() {
  for (const [id, provider] of Object.entries(AI_PROVIDERS)) {
    const keyEl = document.getElementById(`cfg-${id}-key`);
    const modelEl = document.getElementById(`cfg-${id}-model`);
    const data = {
      apiKey: keyEl?.value?.trim() || '',
      model: modelEl?.value || provider.defaultModel,
    };
    if (id === 'custom') {
      const endpointEl = document.getElementById('cfg-custom-endpoint');
      const modelNameEl = document.getElementById('cfg-custom-modelname');
      data.endpoint = endpointEl?.value?.trim() || '';
      if (modelNameEl?.value?.trim()) {
        data.model = modelNameEl.value.trim();
        data.customModels = [modelNameEl.value.trim()];
      }
    }
    saveProviderConfig(id, data);
  }
  document.getElementById('settings-modal').classList.add('hidden');
}

function closeSettings() {
  document.getElementById('settings-modal').classList.add('hidden');
}

// ============================================================
// AI 解读 UI 控制
// ============================================================

let currentAbortController = null;

function renderProviderSelector() {
  const select = document.getElementById('ai-provider-select');
  if (!select) return;
  select.innerHTML = '';

  const configured = getConfiguredProviders();
  const lastUsed = getLastProvider();

  if (configured.length === 0) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = '请先配置 API Key ↗';
    select.appendChild(opt);
    return;
  }

  for (const id of configured) {
    const p = AI_PROVIDERS[id];
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = `${p.name}（${p.hint}）`;
    if (id === lastUsed) opt.selected = true;
    select.appendChild(opt);
  }
}

async function startAIInterpretation(reading, question, dateInfo) {
  const select = document.getElementById('ai-provider-select');
  const providerId = select?.value;

  if (!providerId) {
    renderSettingsModal();
    return;
  }

  setLastProvider(providerId);

  const outputEl = document.getElementById('ai-output');
  const btnEl = document.getElementById('btn-ai-interpret');
  const stopBtn = document.getElementById('btn-ai-stop');

  outputEl.textContent = '';
  outputEl.classList.remove('hidden');
  btnEl.disabled = true;
  stopBtn.classList.remove('hidden');

  currentAbortController = new AbortController();

  try {
    const prompt = buildDivinationPrompt(reading, question, dateInfo);
    let fullText = '';

    for await (const chunk of streamAI(providerId, prompt)) {
      if (currentAbortController.signal.aborted) break;
      fullText += chunk;
      outputEl.textContent = fullText;
      outputEl.scrollTop = outputEl.scrollHeight;
    }
  } catch (err) {
    if (!currentAbortController.signal.aborted) {
      outputEl.textContent += `\n\n❌ 错误：${err.message}`;
    }
  } finally {
    btnEl.disabled = false;
    stopBtn.classList.add('hidden');
    currentAbortController = null;
  }
}

function stopAIInterpretation() {
  if (currentAbortController) {
    currentAbortController.abort();
  }
}
