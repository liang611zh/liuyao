// ============================================================
// 六爻排盘 - 应用逻辑
// ============================================================

const state = {
  phase: 'start',
  currentThrow: 0,
  throws: [],
  coins: [0, 0, 0],
  isAutoRunning: false,
  question: '',
  mode: 'random',
  lastReading: null,
  resultDateInfo: '',
  // 用户在起始页手动指定的时辰索引；null 表示跟随系统时钟
  shichenOverride: null,
  // 起卦那一刻的干支快照（含日干支、旬空、时辰），排盘全程以此为准
  timeInfo: null,
};

// ============================================================
// 干支历计算 (简化版，基于已知参考日推算)
// ============================================================
const EARTHLY_BRANCHES_12 = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];

// 晚子时（23:00 起）是否进为次日干支。
// 六爻纳甲通行「晚子时」派：23:00 一到即换日。改为 false 则按日历日算。
const LATE_ZI_ADVANCES_DAY = true;

// 根据小时获取时辰索引 (子时从23点开始)
function getShichenIndex(hour) {
  return Math.floor(((hour + 1) % 24) / 2);
}

// 计算六十甲子日序 0-59（0 = 甲子）
// 参考基准：2000-01-07 为甲子日
function getDayJiaziIndex(date) {
  const ref = new Date(2000, 0, 7);
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  let diff = Math.round((d - ref) / 86400000);
  if (LATE_ZI_ADVANCES_DAY && date.getHours() >= 23) diff += 1;
  return ((diff % 60) + 60) % 60;
}

// 旬空（空亡）：本旬十天配十干，余下两支无干可配即为空
// 甲子旬空戌亥、甲戌旬空申酉、甲申旬空午未、甲午旬空辰巳、甲辰旬空寅卯、甲寅旬空子丑
function getXunKong(jiaziIdx) {
  const xunHeadBranchIdx = (jiaziIdx - (jiaziIdx % 10)) % 12;
  return [
    EARTHLY_BRANCHES_12[(xunHeadBranchIdx + 10) % 12],
    EARTHLY_BRANCHES_12[(xunHeadBranchIdx + 11) % 12],
  ];
}

// 取某一时刻的完整干支信息
// shichenOverride 为 0-11 时覆盖时辰（只影响所记时辰，不影响日干支）
function getTimeInfo(date, shichenOverride) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = date.getHours();
  const min = String(date.getMinutes()).padStart(2, '0');

  const jiaziIdx = getDayJiaziIndex(date);
  const dayStem = HEAVENLY_STEMS[jiaziIdx % 10];
  const dayBranch = EARTHLY_BRANCHES_12[jiaziIdx % 12];
  const xunKong = getXunKong(jiaziIdx);

  const shichenIdx = (shichenOverride === null || shichenOverride === undefined)
    ? getShichenIndex(h)
    : shichenOverride;
  const shichen = EARTHLY_BRANCHES_12[shichenIdx];
  const shichenNames = t('shichen_names');

  return {
    dateStr: `${y}-${m}-${d} ${String(h).padStart(2,'0')}:${min}`,
    dayGanZhi: t('day_ganzhi', { gz: `${dayStem}${dayBranch}` }),
    shichen: t('shichen_short', { branch: shichen }),
    shichenFull: shichenNames[shichenIdx],
    dayStem,
    dayBranch,
    shichenIdx,
    jiaziIdx,
    xunKong,
    xunKongStr: xunKong.join(''),
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

// 初/二/三爻取内卦纳甲，四/五/上爻取外卦纳甲（两者地支不同，不可共用一张表）
function calculateNajia(upperTrigram, lowerTrigram) {
  return [...NAJIA_INNER[lowerTrigram], ...NAJIA_OUTER[upperTrigram]];
}

function calculateNajiaStems(upperTrigram, lowerTrigram) {
  const inner = NAJIA_STEM_INNER[lowerTrigram];
  const outer = NAJIA_STEM_OUTER[upperTrigram];
  return [inner, inner, inner, outer, outer, outer];
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

function calculateFullReading(throws, timeInfo) {
  const { originalBin, changedBin, hasChanging } = buildHexagrams(throws);
  const original = lookupHexagram(originalBin);
  const changed = hasChanging ? lookupHexagram(changedBin) : null;
  if (!original) return null;

  const shiYing = SHI_YING_MAP[original.palaceIndex];
  const najia = calculateNajia(original.upperTrigram, original.lowerTrigram);
  const stems = calculateNajiaStems(original.upperTrigram, original.lowerTrigram);
  const palaceElement = TRIGRAMS[TRIGRAM_BY_NAME[original.palace]].element;
  const relations = najia.map(b => getSixRelation(palaceElement, BRANCH_ELEMENT[b]));
  const spirits = calculateSixSpirits(timeInfo.dayStem);
  const xunKong = timeInfo.xunKong;

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
      stem: stems[i],
      branch: najia[i],
      branchElement: BRANCH_ELEMENT[najia[i]],
      relation: relations[i],
      spirit: spirits[i],
      isShi: shiYing.shi === i + 1,
      isYing: shiYing.ying === i + 1,
      isXunKong: xunKong.includes(najia[i]),
      changedBranch: changedNajia ? changedNajia[i] : null,
      changedRelation: changedRelations ? changedRelations[i] : null,
      changedIsXunKong: changedNajia ? xunKong.includes(changedNajia[i]) : false,
    });
  }

  return { original, changed, lines, hasChanging, palaceElement, timeInfo };
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
  $('screen-history').classList.toggle('hidden', state.phase !== 'history');
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
  const shichenSelect = $('shichen-select');
  const shichenNames = t('shichen_names');
  shichenNames.forEach((name, i) => {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = t('shichen_option', { branch: EARTHLY_BRANCHES_12[i], name });
    shichenSelect.appendChild(opt);
  });

  // 用户手选时辰后不再跟随系统时钟；选回当前时辰则恢复跟随
  shichenSelect.addEventListener('change', () => {
    const picked = parseInt(shichenSelect.value, 10);
    const nowIdx = getShichenIndex(new Date().getHours());
    state.shichenOverride = picked === nowIdx ? null : picked;
    refreshStartClock();
  });

  refreshStartClock();
  $('btn-start').addEventListener('click', startDivination);

  setInterval(refreshStartClock, 10000);
}

// 刷新起始页的时间/干支显示；未手选时辰时同步下拉框到当前时辰
function refreshStartClock() {
  const info = getTimeInfo(new Date(), state.shichenOverride);
  $('current-datetime').textContent = info.dateStr;
  $('current-ganzhi').textContent =
    `${info.dayGanZhi}  ${info.shichenFull}  ${t('label_xunkong')}${info.xunKongStr}`;
  if (state.shichenOverride === null) {
    $('shichen-select').value = String(info.shichenIdx);
  }
}

// 起卦时刻快照：日干支、旬空、时辰全部锁定在此刻
function snapshotTime() {
  state.timeInfo = getTimeInfo(new Date(), state.shichenOverride);
  return state.timeInfo;
}

function startDivination() {
  state.phase = 'throwing';
  state.currentThrow = 0;
  state.throws = [];
  state.isAutoRunning = true;
  state.question = ($('question-text')?.value || '').trim();
  state.mode = 'random';
  snapshotTime();
  track('divination_started', { mode: 'random' });
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

  const info = state.timeInfo || snapshotTime();
  const reading = calculateFullReading(state.throws, info);
  if (!reading) {
    $('result-title').innerHTML = `<p style="color:red">${t('error_calc')}</p>`;
    return;
  }

  presentReading(reading, info);

  track('divination_completed', {
    hexagram: reading.original.gua,
    palace: reading.original.palace,
    has_changing: reading.hasChanging,
    changing_count: reading.lines.filter(l => l.isChanging).length,
    changed_hexagram: reading.changed ? reading.changed.gua : null,
    has_question: Boolean(state.question),
  });

  // 自动存档。先落本地保证不丢，已登录则同时上云
  const record = createReadingRecord({
    throws: state.throws,
    timeInfo: info,
    question: state.question,
    mode: state.mode,
  });
  persistReading(record).catch(err => console.error('save reading failed:', err));
}

// 把一盘排盘呈现到结果页。新起的卦和从历史里翻出来的卦共用这一段
function presentReading(reading, info) {
  state.lastReading = reading;
  state.timeInfo = info;

  renderResultScreen(reading);

  // 旬空由 prompt 里的「日建/旬空」独立一行给出，此处不重复
  state.resultDateInfo = `${info.dateStr} ${info.dayGanZhi} ${info.shichen}`;
  renderProviderSelector();

  $('ai-output').textContent = '';
  $('ai-output').classList.add('hidden');
}

function renderResultScreen(reading) {
  const { original, changed, lines, hasChanging, timeInfo } = reading;
  const ps = t('palace_suffix');

  let titleHTML = `<span class="gua-name">${original.gua}</span>`;
  titleHTML += `<span class="palace-label">（${original.palace}${ps}）</span>`;
  if (hasChanging && changed) {
    titleHTML += `<span class="arrow"> → </span>`;
    titleHTML += `<span class="gua-name">${changed.gua}</span>`;
    titleHTML += `<span class="palace-label">（${changed.palace}${ps}）</span>`;
  }
  $('result-title').innerHTML = titleHTML;

  $('result-datetime').textContent =
    `${timeInfo.dateStr} ${timeInfo.dayGanZhi} ${timeInfo.shichen} · ` +
    `${t('label_rijian')}${timeInfo.dayBranch} · ${t('label_xunkong')}${timeInfo.xunKongStr}`;

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
        const changedKong = line.changedIsXunKong ? `<i class="kong-marker">${t('marker_kong')}</i>` : '';
        changedHTML = `
          <div class="col-yao">${renderYaoLineHTML(changedIsYang, false, false)}</div>
          <div class="col-branch2">${line.changedBranch || ''}${changedKong}</div>
          <div class="col-relation2">${line.changedRelation || ''}</div>
        `;
      } else {
        changedHTML = `<div class="col-yao"></div><div class="col-branch2"></div><div class="col-relation2"></div>`;
      }
    }

    row.innerHTML = `
      <div class="col-spirit">${line.spirit}</div>
      <div class="col-relation">${line.relation}</div>
      <div class="col-branch">${line.branch}${line.branchElement}${line.isXunKong ? `<i class="kong-marker">${t('marker_kong')}</i>` : ''}</div>
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
// html2canvas 约 200KB，只有点「保存结果图」才用得上，改为首次点击时按需加载
const HTML2CANVAS_SRC = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
let html2canvasPromise = null;

function loadHtml2Canvas() {
  if (typeof html2canvas !== 'undefined') return Promise.resolve(html2canvas);
  if (html2canvasPromise) return html2canvasPromise;
  html2canvasPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = HTML2CANVAS_SRC;
    s.onload = () => resolve(window.html2canvas);
    s.onerror = () => {
      html2canvasPromise = null;
      reject(new Error('html2canvas load failed'));
    };
    document.head.appendChild(s);
  });
  return html2canvasPromise;
}

async function saveResultImage() {
  const btn = $('btn-save');
  const origText = btn.textContent;
  btn.textContent = t('saving');
  btn.disabled = true;

  try {
    const html2canvas = await loadHtml2Canvas();
    const captureEl = $('capture-area');
    const canvas = await html2canvas(captureEl, {
      backgroundColor: '#0c0c18',
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
    track('result_image_saved', { hexagram: guaName });

    btn.textContent = t('saved');
    setTimeout(() => {
      btn.textContent = origText;
      btn.disabled = false;
    }, 2000);
  } catch (err) {
    console.error('Save failed:', err);
    track('result_image_failed', { reason: err.message });
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
  state.mode = 'manual';
  track('divination_started', { mode: 'manual' });
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
  snapshotTime();
  showResult();
}

function restart() {
  state.phase = 'start';
  state.currentThrow = 0;
  state.throws = [];
  state.timeInfo = null;
  refreshStartClock();
  render();
}

// ============================================================
// 卦例历史
// ============================================================

async function showHistory() {
  state.phase = 'history';
  render();

  const list = $('history-list');
  const hint = $('history-hint');
  list.textContent = '';
  hint.textContent = t('history_loading');

  let result;
  try {
    result = await listReadings();
  } catch (err) {
    console.error('list readings failed:', err);
    result = { records: loadLocalHistory(), source: 'local' };
  }

  const { records, source } = result;
  hint.textContent = source === 'cloud'
    ? t('history_hint_cloud')
    : (isCloudConfigured() ? t('history_hint_local_signin') : t('history_hint_local_only'));

  if (!records.length) {
    const empty = document.createElement('div');
    empty.className = 'history-empty';
    empty.textContent = t('history_empty');
    list.appendChild(empty);
    return;
  }

  for (const rec of records) {
    const item = summarizeRecord(rec);
    if (item) list.appendChild(buildHistoryRow(rec, item));
  }
  track('history_opened', { source, count: records.length });
}

// 用 DOM API 而非 innerHTML：占问之事是用户输入的任意文本，
// 拼进 HTML 就等于开了个注入口子
function buildHistoryRow(rec, item) {
  const row = document.createElement('div');
  row.className = 'history-item';

  const main = document.createElement('button');
  main.type = 'button';
  main.className = 'history-item-main';
  main.addEventListener('click', () => viewRecord(rec));

  const line1 = document.createElement('div');
  line1.className = 'history-item-gua';
  line1.textContent = item.changedGua ? `${item.gua} → ${item.changedGua}` : item.gua;
  main.appendChild(line1);

  const line2 = document.createElement('div');
  line2.className = 'history-item-meta';
  line2.textContent = `${item.dateStr}　${item.ganzhi}`;
  main.appendChild(line2);

  if (item.question) {
    const line3 = document.createElement('div');
    line3.className = 'history-item-question';
    line3.textContent = item.question;
    main.appendChild(line3);
  }

  row.appendChild(main);

  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'history-item-delete';
  del.textContent = '×';
  del.title = t('history_delete');
  del.setAttribute('aria-label', t('history_delete'));
  del.addEventListener('click', async () => {
    if (!confirm(t('history_confirm_delete'))) return;
    del.disabled = true;
    await removeReading(rec);
    row.remove();
    track('history_reading_deleted');
    if (!$('history-list').children.length) showHistory();
  });
  row.appendChild(del);

  return row;
}

// 从历史里翻出一盘重看。不重新存档
function viewRecord(rec) {
  const built = buildReadingFromRecord(rec);
  if (!built.reading) return;

  state.throws = built.throws;
  state.question = rec.question || '';
  state.mode = rec.mode || 'random';
  state.phase = 'result';
  render();
  presentReading(built.reading, built.timeInfo);
  window.scrollTo(0, 0);
  track('history_reading_opened', { hexagram: built.reading.original.gua });
}

// ============================================================
// 账户
// ============================================================

function updateAccountButton() {
  const btn = $('btn-account');
  const user = getCurrentUser();
  btn.textContent = user ? t('btn_account_signed_in') : t('btn_account');
  btn.classList.toggle('top-btn-active', Boolean(user));
}

function openAccountModal() {
  renderAccountModal();
  $('account-modal').classList.remove('hidden');
  track('account_modal_opened');
}

function closeAccountModal() {
  $('account-modal').classList.add('hidden');
}

function renderAccountModal(message) {
  const body = $('account-body');
  body.textContent = '';

  // 未配置 Supabase（本地开发、他人 fork）：说明卦例只在本机
  if (!isCloudConfigured()) {
    body.appendChild(makeAccountNote(t('account_not_configured')));
    return;
  }

  const user = getCurrentUser();
  if (user) {
    body.appendChild(makeAccountNote(t('account_signed_in_as')));

    const email = document.createElement('div');
    email.className = 'account-email';
    email.textContent = user.email || user.id;
    body.appendChild(email);

    body.appendChild(buildNicknameField());

    const out = document.createElement('button');
    out.type = 'button';
    out.className = 'btn-restart btn-account-action';
    out.textContent = t('btn_sign_out');
    out.addEventListener('click', async () => {
      out.disabled = true;
      try {
        await signOut();
      } finally {
        renderAccountModal();
      }
    });
    body.appendChild(out);
    if (message) body.appendChild(makeAccountNote(message));
    return;
  }

  body.appendChild(makeAccountNote(t('account_signin_intro')));

  // 第三方登录。放在邮箱之前 —— 一次点击 vs 跳去邮箱翻链接，转化差很远
  const providers = getOAuthProviders();
  if (providers.length) {
    const group = document.createElement('div');
    group.className = 'oauth-group';
    for (const provider of providers) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `btn-oauth btn-oauth-${provider}`;
      btn.textContent = t('account_continue_with', { provider: getOAuthProviderName(provider) });
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        try {
          await signInWithOAuth(provider);   // 成功即跳转离站
        } catch (err) {
          btn.disabled = false;
          renderAccountModal(err.message);
        }
      });
      group.appendChild(btn);
    }
    body.appendChild(group);

    const divider = document.createElement('div');
    divider.className = 'oauth-divider';
    const dividerText = document.createElement('span');
    dividerText.textContent = t('account_or');
    divider.appendChild(dividerText);
    body.appendChild(divider);
  }

  const field = document.createElement('div');
  field.className = 'settings-field';
  const label = document.createElement('label');
  label.textContent = t('account_email_label');
  label.setAttribute('for', 'account-email');
  const input = document.createElement('input');
  input.type = 'email';
  input.id = 'account-email';
  input.autocomplete = 'email';
  input.placeholder = t('account_email_placeholder');
  field.appendChild(label);
  field.appendChild(input);
  body.appendChild(field);

  const emailHint = document.createElement('p');
  emailHint.className = 'account-hint';
  emailHint.textContent = t('account_email_hint');
  body.appendChild(emailHint);

  const status = document.createElement('div');
  status.className = 'account-status';
  if (message) status.textContent = message;

  const send = document.createElement('button');
  send.type = 'button';
  send.className = 'btn-primary btn-account-action';
  send.textContent = t('btn_send_magic_link');
  const submit = async () => {
    const email = input.value.trim();
    // 只做基本形状校验，真正的有效性由收不收得到邮件决定
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      status.textContent = t('account_error_invalid_email');
      return;
    }
    send.disabled = true;
    send.textContent = t('account_sending');
    status.textContent = '';
    try {
      await signInWithEmail(email);
      status.textContent = t('account_link_sent');
    } catch (err) {
      status.textContent = err.message;
      send.disabled = false;
      send.textContent = t('btn_send_magic_link');
    }
  };
  send.addEventListener('click', submit);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });

  body.appendChild(send);
  body.appendChild(status);
}

// 昵称编辑。资料由数据库触发器在注册时自动建档，
// Google / GitHub 登录会带回昵称，邮箱登录则用 @ 前缀兜底。
function buildNicknameField() {
  const wrap = document.createElement('div');

  const field = document.createElement('div');
  field.className = 'settings-field';
  const label = document.createElement('label');
  label.setAttribute('for', 'account-nickname');
  label.textContent = t('account_nickname_label');
  const input = document.createElement('input');
  input.type = 'text';
  input.id = 'account-nickname';
  input.maxLength = 40;
  input.placeholder = t('account_nickname_placeholder');
  const profile = getCurrentProfile();
  input.value = profile && profile.nickname ? profile.nickname : '';
  field.appendChild(label);
  field.appendChild(input);
  wrap.appendChild(field);

  const status = document.createElement('div');
  status.className = 'account-status';

  const save = document.createElement('button');
  save.type = 'button';
  save.className = 'btn-secondary btn-account-action';
  save.textContent = t('btn_save_nickname');
  const submit = async () => {
    save.disabled = true;
    status.textContent = '';
    try {
      await updateNickname(input.value);
      status.textContent = t('account_nickname_saved');
      updateAccountButton();
    } catch (err) {
      status.textContent = err.message;
    } finally {
      save.disabled = false;
    }
  };
  save.addEventListener('click', submit);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });

  wrap.appendChild(save);
  wrap.appendChild(status);

  // 资料可能还没拉取（刚恢复会话时），拉到再回填
  if (!profile) {
    fetchProfile()
      .then(p => { if (p && p.nickname && !input.value) input.value = p.nickname; })
      .catch(err => console.error('fetch profile failed:', err));
  }

  return wrap;
}

function makeAccountNote(text) {
  const note = document.createElement('p');
  note.className = 'account-note';
  note.textContent = text;
  return note;
}

// ============================================================
// 初始化
// ============================================================
function init() {
  initAnalytics();
  initLangSelector();
  applyLanguage();
  initStartScreen();
  render();
  $('btn-manual').addEventListener('click', startManual);
  $('btn-manual-submit').addEventListener('click', submitManual);
  $('btn-manual-back').addEventListener('click', restart);
  $('btn-save').addEventListener('click', saveResultImage);
  $('btn-restart').addEventListener('click', restart);

  // 历史与账户
  $('btn-history').addEventListener('click', showHistory);
  $('btn-history-back').addEventListener('click', restart);
  $('btn-account').addEventListener('click', openAccountModal);
  $('btn-account-close').addEventListener('click', closeAccountModal);
  onAccountChange(() => {
    updateAccountButton();
    if (!$('account-modal').classList.contains('hidden')) renderAccountModal();
    // 登录状态一变，历史来源就从本地切到云端（或反之），重新拉一次
    if (state.phase === 'history') showHistory();
  });
  updateAccountButton();
  // 只有确实可能已登录（本地有会话，或刚从登录邮件跳回来）才会真的加载 SDK
  initCloudAccount().catch(err => console.error('cloud init failed:', err));

  // 统计 opt-out 开关：只在统计确实启用时才露出，本地开发不显示
  if (window.liuyaoAnalytics && window.liuyaoAnalytics.isEnabled()) {
    const optOutBtn = $('btn-analytics-optout');
    $('privacy-note').classList.remove('hidden');
    optOutBtn.addEventListener('click', () => {
      window.liuyaoAnalytics.optOut();
      optOutBtn.textContent = t('analytics_optout_done');
      optOutBtn.disabled = true;
    });
  }

  // 复制卦象结果
  $('btn-copy-prompt').addEventListener('click', () => {
    if (!state.lastReading) return;
    const prompt = buildDivinationPrompt(state.lastReading, state.question, state.resultDateInfo);
    const onCopied = () => {
      track('result_copied', { hexagram: state.lastReading.original.gua });
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
  $('btn-ai-settings').addEventListener('click', () => {
    track('ai_settings_opened');
    renderSettingsModal();
  });
  $('btn-settings-save').addEventListener('click', saveSettings);
  $('btn-settings-close').addEventListener('click', closeSettings);
}

document.addEventListener('DOMContentLoaded', init);
