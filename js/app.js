// ============================================================
// 六爻排盘 - 应用逻辑
// ============================================================

const state = {
  phase: 'start',
  currentThrow: 0,
  throws: [],
  coins: [0, 0, 0],
  dayStem: '',
  isAutoRunning: false,
  question: '',
  lastReading: null,
  resultDateInfo: '',
};

// ============================================================
// 干支历计算 (简化版，基于已知参考日推算)
// ============================================================
const EARTHLY_BRANCHES_12 = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];

// 根据小时获取时辰索引 (子时从23点开始)
function getShichenIndex(hour) {
  return Math.floor(((hour + 1) % 24) / 2);
}

// 计算日天干 (参考: 2000年1月7日 = 甲子日)
function getDayStemIndex(date) {
  const ref = new Date(2000, 0, 7);
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diff = Math.round((d - ref) / 86400000);
  return ((diff % 10) + 10) % 10;
}

function getDayStem(date) {
  return HEAVENLY_STEMS[getDayStemIndex(date)];
}

// 计算日地支索引
function getDayBranchIndex(date) {
  const ref = new Date(2000, 0, 7);
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diff = Math.round((d - ref) / 86400000);
  return ((diff % 12) + 12) % 12;
}

// 格式化当前日期时间的干支信息
function formatDateTime(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = date.getHours();
  const min = String(date.getMinutes()).padStart(2, '0');

  const dayStemIdx = getDayStemIndex(date);
  const dayBranchIdx = getDayBranchIndex(date);
  const dayStem = HEAVENLY_STEMS[dayStemIdx];
  const dayBranch = EARTHLY_BRANCHES_12[dayBranchIdx];

  const shichenIdx = getShichenIndex(h);
  const shichen = EARTHLY_BRANCHES_12[shichenIdx];
  const shichenNames = t('shichen_names');

  return {
    dateStr: `${y}-${m}-${d} ${String(h).padStart(2,'0')}:${min}`,
    dayGanZhi: `${dayStem}${dayBranch}日`,
    shichen: `${shichen}时`,
    shichenFull: shichenNames[shichenIdx],
    dayStem,
    shichenIdx,
  };
}

// ============================================================
// 核心算法
// ============================================================

function getYaoValue(coins) {
  const tails = coins.filter(c => c === 0).length;
  return [9, 8, 7, 6][tails];
}

function getYaoInfo(value) {
  const labels = t('yao_labels');
  return {
    isYang: value === 7 || value === 9,
    isChanging: value === 6 || value === 9,
    label: labels[value],
  };
}

function buildHexagrams(throws) {
  let originalBin = '';
  let changedBin = '';
  let hasChanging = false;

  for (let i = 0; i < 6; i++) {
    const info = getYaoInfo(throws[i].value);
    const origBit = info.isYang ? '1' : '0';
    originalBin += origBit;
    if (info.isChanging) {
      hasChanging = true;
      changedBin += info.isYang ? '0' : '1';
    } else {
      changedBin += origBit;
    }
  }
  return { originalBin, changedBin, hasChanging };
}

function lookupHexagram(binary) {
  const hex = HEXAGRAMS[binary];
  if (!hex) return null;
  return { ...hex };
}

function calculateNajia(upperTrigram, lowerTrigram) {
  return [...NAJIA[lowerTrigram], ...NAJIA[upperTrigram]];
}

function getSixRelation(palaceElement, lineElement) {
  if (palaceElement === lineElement) return '兄弟';
  if (SHENG_CYCLE[palaceElement] === lineElement) return '子孙';
  if (SHENG_CYCLE[lineElement] === palaceElement) return '父母';
  if (KE_CYCLE[palaceElement] === lineElement) return '妻财';
  if (KE_CYCLE[lineElement] === palaceElement) return '官鬼';
  return '?';
}

function calculateSixSpirits(dayStem) {
  const startIdx = SPIRIT_START[dayStem] || 0;
  return Array.from({ length: 6 }, (_, i) => SIX_SPIRITS[(startIdx + i) % 6]);
}

function calculateFullReading(throws, dayStem) {
  const { originalBin, changedBin, hasChanging } = buildHexagrams(throws);
  const original = lookupHexagram(originalBin);
  const changed = hasChanging ? lookupHexagram(changedBin) : null;
  if (!original) return null;

  const shiYing = SHI_YING_MAP[original.palaceIndex];
  const najia = calculateNajia(original.upperTrigram, original.lowerTrigram);
  const palaceElement = TRIGRAMS[TRIGRAM_BY_NAME[original.palace]].element;
  const relations = najia.map(b => getSixRelation(palaceElement, BRANCH_ELEMENT[b]));
  const spirits = calculateSixSpirits(dayStem);

  let changedNajia = null, changedRelations = null;
  if (changed) {
    changedNajia = calculateNajia(changed.upperTrigram, changed.lowerTrigram);
    const cpe = TRIGRAMS[TRIGRAM_BY_NAME[changed.palace]].element;
    changedRelations = changedNajia.map(b => getSixRelation(cpe, BRANCH_ELEMENT[b]));
  }

  const lines = [];
  for (let i = 0; i < 6; i++) {
    const info = getYaoInfo(throws[i].value);
    lines.push({
      position: i + 1,
      value: throws[i].value,
      isYang: info.isYang,
      isChanging: info.isChanging,
      label: info.label,
      branch: najia[i],
      branchElement: BRANCH_ELEMENT[najia[i]],
      relation: relations[i],
      spirit: spirits[i],
      isShi: shiYing.shi === i + 1,
      isYing: shiYing.ying === i + 1,
      changedBranch: changedNajia ? changedNajia[i] : null,
      changedRelation: changedRelations ? changedRelations[i] : null,
    });
  }

  return { original, changed, lines, hasChanging, palaceElement };
}

// ============================================================
// UI
// ============================================================

const $ = id => document.getElementById(id);

function render() {
  $('screen-start').classList.toggle('hidden', state.phase !== 'start');
  $('screen-throwing').classList.toggle('hidden', state.phase !== 'throwing');
  $('screen-manual').classList.toggle('hidden', state.phase !== 'manual');
  $('screen-result').classList.toggle('hidden', state.phase !== 'result');
}

// 创建铜钱DOM元素
function createCoinElement(isHeads, animate) {
  const coin = document.createElement('div');
  coin.className = 'coin ' + (isHeads ? 'coin-heads' : 'coin-tails');
  if (animate) coin.classList.add('coin-flipping');

  if (isHeads) {
    const chars = ['顺','治','通','宝'];
    const positions = ['top','bottom','left','right'];
    for (let i = 0; i < 4; i++) {
      const span = document.createElement('span');
      span.className = `coin-text coin-text-${positions[i]}`;
      span.textContent = chars[i];
      coin.appendChild(span);
    }
    const label = document.createElement('span');
    label.className = 'coin-label';
    label.textContent = t('coin_heads');
    coin.appendChild(label);
  } else {
    const label = document.createElement('span');
    label.className = 'coin-label';
    label.textContent = t('coin_tails');
    coin.appendChild(label);
  }

  return coin;
}

// 语言选择器
function initLangSelector() {
  const select = $('lang-select');
  for (const [code, name] of Object.entries(SUPPORTED_LANGS)) {
    const opt = document.createElement('option');
    opt.value = code;
    opt.textContent = name;
    if (code === currentLang) opt.selected = true;
    select.appendChild(opt);
  }
  select.addEventListener('change', () => setLanguage(select.value));
}

// 起始页
function initStartScreen() {
  const now = new Date();
  const info = formatDateTime(now);

  $('current-datetime').textContent = info.dateStr;
  $('current-ganzhi').textContent = `${info.dayGanZhi}  ${info.shichenFull}`;

  state.dayStem = info.dayStem;

  // 时辰选择器
  const shichenSelect = $('shichen-select');
  const shichenNames = t('shichen_names');
  shichenNames.forEach((name, i) => {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = t('shichen_option', { branch: EARTHLY_BRANCHES_12[i], name });
    if (i === info.shichenIdx) opt.selected = true;
    shichenSelect.appendChild(opt);
  });

  $('btn-start').addEventListener('click', startDivination);

  setInterval(() => {
    const n = new Date();
    const inf = formatDateTime(n);
    $('current-datetime').textContent = inf.dateStr;
  }, 10000);
}

function startDivination() {
  state.phase = 'throwing';
  state.currentThrow = 0;
  state.throws = [];
  state.isAutoRunning = true;
  state.question = ($('question-text')?.value || '').trim();
  render();
  renderThrowScreen();
  autoRunAllThrows();
}

// 自动执行全部6次摇卦
async function autoRunAllThrows() {
  for (let i = 0; i < 6; i++) {
    state.currentThrow = i;
    renderThrowScreen();
    await animateOneThrow();
    await sleep(300);
  }
  showResult();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 单次摇卦动画
async function animateOneThrow() {
  const display = $('coins-display');

  display.innerHTML = '';
  for (let i = 0; i < 3; i++) {
    const placeholder = document.createElement('div');
    placeholder.className = 'coin-placeholder';
    placeholder.textContent = '?';
    placeholder.id = `coin-slot-${i}`;
    display.appendChild(placeholder);
  }

  await sleep(200);

  const rounds = 6;
  for (let r = 0; r < rounds; r++) {
    for (let i = 0; i < 3; i++) {
      const slot = $(`coin-slot-${i}`);
      if (slot) {
        const isHeads = Math.random() > 0.5;
        const newCoin = createCoinElement(isHeads, true);
        newCoin.id = `coin-slot-${i}`;
        slot.replaceWith(newCoin);
      }
    }
    await sleep(150);
  }

  const finalCoins = [0, 0, 0].map(() => Math.random() > 0.5 ? 1 : 0);
  state.coins = finalCoins;

  for (let i = 0; i < 3; i++) {
    const slot = $(`coin-slot-${i}`);
    const finalCoin = createCoinElement(finalCoins[i] === 1, false);
    finalCoin.id = `coin-slot-${i}`;
    finalCoin.classList.add('coin-bouncing');
    if (slot) slot.replaceWith(finalCoin);
  }

  await sleep(400);

  const value = getYaoValue(finalCoins);
  const info = getYaoInfo(value);
  $('throw-result-text').textContent = `${info.label}（${value}）`;
  $('throw-result-text').className = 'throw-result' + (info.isChanging ? ' changing' : '');

  state.throws.push({ coins: [...finalCoins], value });
  renderThrowPreview();

  await sleep(500);
}

// 摇卦画面渲染
function renderThrowScreen() {
  const n = state.currentThrow + 1;
  const posNames = t('pos_names');
  $('throw-progress').textContent = t('throw_progress', { n, pos: posNames[state.currentThrow] });

  const hintText = state.question
    ? t('throw_hint_meditate_q', { q: state.question })
    : t('throw_hint_meditate');
  $('throw-hint').textContent = n === 1
    ? `${t('throw_hint_first')} · ${hintText}`
    : hintText;

  $('throw-result-text').textContent = '';
  renderThrowPreview();
}

function renderThrowPreview() {
  const container = $('throw-preview');
  container.innerHTML = '';
  for (let i = 5; i >= 0; i--) {
    const row = document.createElement('div');
    row.className = 'preview-line';
    if (i < state.throws.length) {
      const info = getYaoInfo(state.throws[i].value);
      row.innerHTML = renderYaoLineHTML(info.isYang, info.isChanging, true);
    } else if (i === state.currentThrow) {
      row.innerHTML = `<div class="yao-placeholder">${t('preview_current')}</div>`;
    } else {
      row.innerHTML = '<div class="yao-placeholder">—</div>';
    }
    container.appendChild(row);
  }
}

function renderYaoLineHTML(isYang, isChanging, small) {
  const sizeClass = small ? 'yao-small' : 'yao-line';
  if (isYang) {
    return `<div class="${sizeClass} yao-yang">
      <div class="yang-bar"></div>
      ${isChanging ? '<span class="change-marker">○</span>' : ''}
    </div>`;
  } else {
    return `<div class="${sizeClass} yao-yin">
      <div class="yin-bar"></div>
      <div class="yin-gap"></div>
      <div class="yin-bar"></div>
      ${isChanging ? '<span class="change-marker">×</span>' : ''}
    </div>`;
  }
}

// ============================================================
// 排盘结果
// ============================================================
function showResult() {
  state.phase = 'result';
  state.isAutoRunning = false;
  render();

  const reading = calculateFullReading(state.throws, state.dayStem);
  if (!reading) {
    $('result-title').innerHTML = `<p style="color:red">${t('error_calc')}</p>`;
    return;
  }
  state.lastReading = reading;

  renderResultScreen(reading);

  const now = new Date();
  const info = formatDateTime(now);
  state.resultDateInfo = `${info.dateStr} ${info.dayGanZhi} ${info.shichen}`;
  renderProviderSelector();

  $('ai-output').textContent = '';
  $('ai-output').classList.add('hidden');
}

function renderResultScreen(reading) {
  const { original, changed, lines, hasChanging } = reading;
  const ps = t('palace_suffix');

  let titleHTML = `<span class="gua-name">${original.gua}</span>`;
  titleHTML += `<span class="palace-label">（${original.palace}${ps}）</span>`;
  if (hasChanging && changed) {
    titleHTML += `<span class="arrow"> → </span>`;
    titleHTML += `<span class="gua-name">${changed.gua}</span>`;
    titleHTML += `<span class="palace-label">（${changed.palace}${ps}）</span>`;
  }
  $('result-title').innerHTML = titleHTML;

  const now = new Date();
  const info = formatDateTime(now);
  $('result-datetime').textContent = `${info.dateStr} ${info.dayGanZhi} ${info.shichen}`;

  const upperTri = TRIGRAMS[TRIGRAM_BY_NAME[original.upperTrigram]];
  const lowerTri = TRIGRAMS[TRIGRAM_BY_NAME[original.lowerTrigram]];
  $('result-trigrams').innerHTML =
    `${t('upper_trigram')}：${original.upperTrigram}（${upperTri.nature}） ｜ ${t('lower_trigram')}：${original.lowerTrigram}（${lowerTri.nature}）`;

  const table = $('result-table');
  table.innerHTML = '';

  const headerRow = document.createElement('div');
  headerRow.className = 'paipan-row paipan-header';
  headerRow.innerHTML = `
    <div class="col-spirit">${t('col_spirit')}</div>
    <div class="col-relation">${t('col_original')}</div>
    <div class="col-branch"></div>
    <div class="col-yao">${t('col_line')}</div>
    <div class="col-marker"></div>
    ${hasChanging ? `<div class="col-yao">${t('col_changed_line')}</div><div class="col-branch2"></div><div class="col-relation2">${t('col_changed_hex')}</div>` : ''}
  `;
  table.appendChild(headerRow);

  for (let i = 5; i >= 0; i--) {
    const line = lines[i];
    const row = document.createElement('div');
    row.className = 'paipan-row';

    let marker = '';
    if (line.isShi) marker = t('marker_shi');
    if (line.isYing) marker = t('marker_ying');

    let changedHTML = '';
    if (hasChanging) {
      if (line.isChanging) {
        const changedIsYang = !line.isYang;
        changedHTML = `
          <div class="col-yao">${renderYaoLineHTML(changedIsYang, false, false)}</div>
          <div class="col-branch2">${line.changedBranch || ''}</div>
          <div class="col-relation2">${line.changedRelation || ''}</div>
        `;
      } else {
        changedHTML = `<div class="col-yao"></div><div class="col-branch2"></div><div class="col-relation2"></div>`;
      }
    }

    row.innerHTML = `
      <div class="col-spirit">${line.spirit}</div>
      <div class="col-relation">${line.relation}</div>
      <div class="col-branch">${line.branch}${line.branchElement}</div>
      <div class="col-yao">${renderYaoLineHTML(line.isYang, line.isChanging, false)}</div>
      <div class="col-marker">${marker}</div>
      ${changedHTML}
    `;
    table.appendChild(row);

    if (i === 3) {
      const divider = document.createElement('div');
      divider.className = 'trigram-divider';
      table.appendChild(divider);
    }
  }
}

// ============================================================
// 保存结果图
// ============================================================
async function saveResultImage() {
  const btn = $('btn-save');
  const origText = btn.textContent;
  btn.textContent = t('saving');
  btn.disabled = true;

  try {
    const captureEl = $('capture-area');
    const canvas = await html2canvas(captureEl, {
      backgroundColor: '#FDF6E3',
      scale: 2,
      useCORS: true,
      logging: false,
    });

    const titleEl = captureEl.querySelector('.gua-name');
    const guaName = titleEl ? titleEl.textContent : 'hexagram';
    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = `liuyao_${guaName}_${dateStr}.png`;

    const link = document.createElement('a');
    link.download = filename;
    link.href = canvas.toDataURL('image/png');
    link.click();

    btn.textContent = t('saved');
    setTimeout(() => {
      btn.textContent = origText;
      btn.disabled = false;
    }, 2000);
  } catch (err) {
    console.error('Save failed:', err);
    btn.textContent = t('save_failed');
    setTimeout(() => {
      btn.textContent = origText;
      btn.disabled = false;
    }, 2000);
  }
}

// ============================================================
// 手动录入模式
// ============================================================

const manualCoins = [];

function startManual() {
  state.phase = 'manual';
  state.question = ($('question-text')?.value || '').trim();
  manualCoins.length = 0;
  for (let i = 0; i < 6; i++) {
    manualCoins.push([-1, -1, -1]);
  }
  render();
  renderManualScreen();
}

function renderManualScreen() {
  const container = $('manual-rows');
  container.innerHTML = '';
  const posNames = t('pos_names');

  for (let i = 0; i < 6; i++) {
    const row = document.createElement('div');
    row.className = 'manual-row';

    const label = document.createElement('div');
    label.className = 'manual-row-label';
    label.textContent = posNames[i];
    row.appendChild(label);

    const coinsDiv = document.createElement('div');
    coinsDiv.className = 'manual-coins';
    for (let j = 0; j < 3; j++) {
      const coin = document.createElement('button');
      coin.className = 'manual-coin';
      const val = manualCoins[i][j];
      if (val === 1) {
        coin.className += ' coin-set-heads';
        coin.textContent = t('coin_heads');
      } else if (val === 0) {
        coin.className += ' coin-set-tails';
        coin.textContent = t('coin_tails');
      } else {
        coin.textContent = '?';
      }
      coin.addEventListener('click', () => {
        if (manualCoins[i][j] === -1) {
          manualCoins[i][j] = 1;
        } else if (manualCoins[i][j] === 1) {
          manualCoins[i][j] = 0;
        } else {
          manualCoins[i][j] = 1;
        }
        renderManualScreen();
      });
      coinsDiv.appendChild(coin);
    }
    row.appendChild(coinsDiv);

    const resultDiv = document.createElement('div');
    resultDiv.className = 'manual-row-result';
    const allSet = manualCoins[i].every(c => c !== -1);
    if (allSet) {
      const value = getYaoValue(manualCoins[i]);
      const info = getYaoInfo(value);
      resultDiv.textContent = info.label;
      resultDiv.className += ' has-value';
      if (info.isChanging) resultDiv.className += ' is-changing';
    }
    row.appendChild(resultDiv);

    container.appendChild(row);
  }

  const allComplete = manualCoins.every(row => row.every(c => c !== -1));
  $('btn-manual-submit').disabled = !allComplete;
}

function submitManual() {
  state.throws = [];
  for (let i = 0; i < 6; i++) {
    const coins = manualCoins[i];
    const value = getYaoValue(coins);
    state.throws.push({ coins: [...coins], value });
  }
  showResult();
}

function restart() {
  state.phase = 'start';
  state.currentThrow = 0;
  state.throws = [];
  render();
}

// ============================================================
// 初始化
// ============================================================
function init() {
  initLangSelector();
  applyLanguage();
  initStartScreen();
  render();
  $('btn-manual').addEventListener('click', startManual);
  $('btn-manual-submit').addEventListener('click', submitManual);
  $('btn-manual-back').addEventListener('click', restart);
  $('btn-save').addEventListener('click', saveResultImage);
  $('btn-restart').addEventListener('click', restart);

  // 复制卦象结果
  $('btn-copy-prompt').addEventListener('click', () => {
    if (!state.lastReading) return;
    const prompt = buildDivinationPrompt(state.lastReading, state.question, state.resultDateInfo);
    const onCopied = () => {
      const btn = $('btn-copy-prompt');
      const hint = $('copy-hint');
      btn.textContent = t('copied');
      hint.classList.remove('hidden');
      hint.style.animation = 'none';
      hint.offsetHeight;
      hint.style.animation = '';
      setTimeout(() => {
        btn.textContent = t('btn_copy');
        hint.classList.add('hidden');
      }, 2000);
    };
    navigator.clipboard.writeText(prompt).then(onCopied).catch(() => {
      const ta = document.createElement('textarea');
      ta.value = prompt;
      ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      onCopied();
    });
  });

  // AI 解读相关
  $('btn-ai-interpret').addEventListener('click', () => {
    if (!state.lastReading) return;
    startAIInterpretation(state.lastReading, state.question, state.resultDateInfo);
  });
  $('btn-ai-stop').addEventListener('click', stopAIInterpretation);
  $('btn-ai-settings').addEventListener('click', renderSettingsModal);
  $('btn-settings-save').addEventListener('click', saveSettings);
  $('btn-settings-close').addEventListener('click', closeSettings);
}

document.addEventListener('DOMContentLoaded', init);
