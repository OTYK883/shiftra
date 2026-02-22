// ============================================================
// Siftra — app.js
// ============================================================

// ============================================================
// STATE
// ============================================================
const State = {
  gasUrl:        localStorage.getItem('siftra_gas_url') || '',
  username:      localStorage.getItem('siftra_username') || 'ユーザー',
  tags:          {},
  items:         [],
  activeFilters: {},
  selectedItems: [],   // プロンプト生成用の選択済みアイテム
  currentItem:   null, // タグ付けモーダル用
  selectedSource: 'Instagram',
  promptOptions: { angle: '', lighting: '' },
  quicksets:     JSON.parse(localStorage.getItem('siftra_quicksets') || '[]'),
};

// ============================================================
// INIT
// ============================================================
async function init() {
  await loadTags();
  renderFilterChips();
  renderModalTagChips();
  await loadItems();
  renderStats();
  setTimeout(hideLoading, 1400);
}

function hideLoading() {
  document.getElementById('loading-screen').classList.add('hidden');
}

// ============================================================
// API
// ============================================================
async function apiGet(params) {
  if (!State.gasUrl) return null;
  const url = new URL(State.gasUrl);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  try {
    const res = await fetch(url.toString());
    return await res.json();
  } catch (e) {
    console.error('API GET error:', e);
    return null;
  }
}

async function apiPost(data) {
  if (!State.gasUrl) return null;
  try {
    const res = await fetch(State.gasUrl, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return await res.json();
  } catch (e) {
    console.error('API POST error:', e);
    return null;
  }
}

// ============================================================
// TAG 読み込み
// ============================================================
async function loadTags() {
  if (State.gasUrl) {
    const data = await apiGet({ action: 'getTags' });
    if (data && !data.error) {
      State.tags = data;
      return;
    }
  }
  // フォールバック：デフォルトタグ
  State.tags = {
    category:  ['バルーン', 'ネオン', 'フラワー', 'シンプル', 'オプ', 'ステージ', 'ゲート'],
    usage:     ['企業式典', '結婚式', '展示会', '屋外イベント', '店舗装飾', '撮影用'],
    tone:      ['エレガント', 'ポップ', 'ナチュラル', 'ラグジュアリー', 'クール', 'キッズ'],
    color:     ['ホワイト', 'ゴールド', 'パステル', 'ビビッド', 'モノクロ', 'グリーン', 'ピンク', 'ブラック'],
    area:      ['エントランス', 'センター', '壁面', '天井', '屋外', 'テーブル', 'ステージ前'],
    cost:      ['〜5万', '5〜20万', '20〜50万', '50万〜'],
    structure: ['大型構造', '吊り下げ', '置き型', '壁付け', '水物', '照明連動', 'アーチ型'],
  };
}

// ============================================================
// ITEMS 読み込み
// ============================================================
async function loadItems(filters = {}) {
  if (!State.gasUrl) {
    renderUntaggedList([]);
    renderResultsGrid([]);
    return;
  }
  const data = await apiGet({ action: 'getItems', ...filters });
  if (data && !data.error) {
    State.items = data.items;
    const untagged = data.items.filter(i => !i.category);
    renderUntaggedList(untagged);
    renderResultsGrid(data.items);
    document.getElementById('inbox-count').textContent = untagged.length;
    document.getElementById('results-count').textContent = `${data.total} 件`;
  }
}

async function renderStats() {
  if (!State.gasUrl) {
    document.getElementById('header-stats').textContent = '設定からGASを接続してください';
    return;
  }
  const data = await apiGet({ action: 'getStats' });
  if (data) {
    document.getElementById('header-stats').textContent =
      `total ${data.total} items`;
  }
}

// ============================================================
// RENDER: 未タグ一覧
// ============================================================
function renderUntaggedList(items) {
  const el = document.getElementById('untagged-list');
  if (!items.length) {
    el.innerHTML = '<div class="empty-state">未タグのアイテムはありません ✓</div>';
    return;
  }
  el.innerHTML = items.map(item => `
    <div class="untagged-item" data-id="${item.id}" onclick="openTagModal('${item.id}')">
      ${renderThumb(item, 'untagged-thumb')}
      <div class="untagged-info">
        <div class="untagged-title">${esc(item.file_name || '無題')}</div>
        <div class="untagged-meta">${formatDate(item.created_at)}</div>
      </div>
      <div class="untagged-source-badge">${esc(item.source || '自社')}</div>
    </div>
  `).join('');
}

function renderThumb(item, cls) {
  const src = item.thumb_url || item.ogp_thumb;
  if (src) {
    return `<img class="${cls}" src="${esc(src)}" alt="" onerror="this.style.display='none'" loading="lazy" />`;
  }
  const emoji = sourceEmoji(item.source);
  return `<div class="${cls} url-thumb">${emoji}</div>`;
}

// ============================================================
// RENDER: 検索結果グリッド
// ============================================================
function renderResultsGrid(items) {
  const el = document.getElementById('results-grid');
  if (!items.length) {
    el.innerHTML = '<div class="empty-state">該当するアイテムがありません</div>';
    return;
  }
  el.innerHTML = items.map(item => {
    const isSelected = State.selectedItems.some(s => s.id === item.id);
    const thumb = item.thumb_url || item.ogp_thumb;
    return `
      <div class="result-card ${isSelected ? 'selected' : ''}"
           data-id="${item.id}"
           onclick="toggleSelect('${item.id}')">
        <div class="result-thumb-wrap">
          ${thumb
            ? `<img class="result-thumb" src="${esc(thumb)}" alt="" loading="lazy" />`
            : `<div class="result-no-thumb">${sourceEmoji(item.source)}</div>`
          }
          <div class="result-source-badge">${esc(item.source || '自社')}</div>
          <div class="result-check">✓</div>
        </div>
        <div class="result-info">
          <div class="result-title">${esc(item.file_name || '無題')}</div>
          <div class="result-tags">
            ${[item.category, item.usage, item.tone].filter(Boolean).map(t =>
              `<span class="result-tag">${esc(t)}</span>`
            ).join('')}
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// ============================================================
// RENDER: フィルターチップ
// ============================================================
function renderFilterChips() {
  ['category', 'usage', 'tone', 'color'].forEach(axis => {
    const el = document.getElementById(`filter-${axis}`);
    if (!el || !State.tags[axis]) return;
    el.innerHTML = State.tags[axis].map(tag => `
      <button class="chip ${State.activeFilters[axis] === tag ? 'active' : ''}"
              data-axis="${axis}" data-value="${tag}"
              onclick="toggleFilter('${axis}', '${tag}', this)">
        ${esc(tag)}
      </button>
    `).join('');
  });
}

// ============================================================
// RENDER: モーダルタグチップ
// ============================================================
function renderModalTagChips() {
  const axes = ['category', 'usage', 'tone', 'color', 'area', 'cost', 'structure'];
  axes.forEach(axis => {
    const el = document.getElementById(`modal-${axis}`);
    if (!el || !State.tags[axis]) return;
    el.innerHTML = State.tags[axis].map(tag => `
      <button class="chip" data-axis="${axis}" data-value="${tag}"
              onclick="selectModalTag('${axis}', '${tag}', this)">
        ${esc(tag)}
      </button>
    `).join('');
  });
}

// ============================================================
// FILTER
// ============================================================
function toggleFilter(axis, value, btn) {
  if (State.activeFilters[axis] === value) {
    delete State.activeFilters[axis];
    btn.classList.remove('active');
  } else {
    // 同軸の既存選択を解除
    document.querySelectorAll(`[data-axis="${axis}"]`).forEach(b => b.classList.remove('active'));
    State.activeFilters[axis] = value;
    btn.classList.add('active');
  }
}

document.getElementById('filter-apply')?.addEventListener('click', () => {
  loadItems(State.activeFilters);
});
document.getElementById('filter-reset')?.addEventListener('click', () => {
  State.activeFilters = {};
  document.querySelectorAll('.filter-chips .chip').forEach(b => b.classList.remove('active'));
  loadItems();
});

// ============================================================
// SELECTION（プロンプト生成用）
// ============================================================
function toggleSelect(id) {
  const item = State.items.find(i => i.id === id);
  if (!item) return;
  const idx = State.selectedItems.findIndex(s => s.id === id);
  if (idx >= 0) {
    State.selectedItems.splice(idx, 1);
  } else {
    State.selectedItems.push(item);
  }
  renderResultsGrid(State.items);
  renderSelectedThumbs();
  document.getElementById('selected-count').textContent = State.selectedItems.length;
}

function renderSelectedThumbs() {
  const el = document.getElementById('selected-thumbs');
  if (!State.selectedItems.length) {
    el.innerHTML = '<div class="empty-state small">検索タブで写真を選択してください</div>';
    return;
  }
  el.innerHTML = State.selectedItems.map(item => {
    const src = item.thumb_url || item.ogp_thumb;
    return `
      <div class="selected-thumb-item">
        ${src ? `<img src="${esc(src)}" alt="" loading="lazy" />` : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:1.5rem">${sourceEmoji(item.source)}</div>`}
        <button class="selected-thumb-remove" onclick="removeSelected('${item.id}')">✕</button>
      </div>
    `;
  }).join('');
}

function removeSelected(id) {
  State.selectedItems = State.selectedItems.filter(i => i.id !== id);
  renderSelectedThumbs();
  renderResultsGrid(State.items);
  document.getElementById('selected-count').textContent = State.selectedItems.length;
}

document.getElementById('clear-selection')?.addEventListener('click', () => {
  State.selectedItems = [];
  renderSelectedThumbs();
  renderResultsGrid(State.items);
  document.getElementById('selected-count').textContent = 0;
});

// ============================================================
// プロンプト生成（nano banana Pro）
// ============================================================
const CATEGORY_EN = {
  'バルーン': 'balloon arch installation',
  'ネオン':   'neon sign installation',
  'フラワー': 'floral decoration',
  'シンプル': 'minimal decoration',
  'オプ':     'projection mapping installation',
  'ステージ': 'stage decoration set',
  'ゲート':   'ceremonial entrance gate',
};
const USAGE_EN = {
  '企業式典': 'corporate ceremony',
  '結婚式':   'wedding ceremony',
  '展示会':   'exhibition event',
  '屋外イベント': 'outdoor event',
  '店舗装飾': 'retail store decoration',
  '撮影用':   'photo shoot set',
};
const TONE_EN = {
  'エレガント':   'elegant and refined',
  'ポップ':       'vibrant and playful',
  'ナチュラル':   'natural and organic',
  'ラグジュアリー': 'luxurious and high-end',
  'クール':       'cool and contemporary',
  'キッズ':       'fun and kid-friendly',
};
const AREA_EN = {
  'エントランス': 'at the entrance of the venue',
  'センター':     'at the center of the hall',
  '壁面':         'mounted on the wall',
  '天井':         'suspended from the ceiling',
  '屋外':         'in an outdoor space',
  'テーブル':     'on the table centerpiece',
  'ステージ前':   'in front of the stage',
};
const STRUCTURE_EN = {
  '大型構造': 'large-scale structure',
  '吊り下げ': 'suspended hanging installation',
  '置き型':   'freestanding placement',
  '壁付け':   'wall-mounted',
  '水物':     'water feature installation',
  '照明連動': 'integrated with lighting',
  'アーチ型': 'archway structure',
};
const COLOR_EN = {
  'ホワイト': 'white',
  'ゴールド': 'gold',
  'パステル': 'pastel',
  'ビビッド': 'vivid saturated',
  'モノクロ': 'monochrome black and white',
  'グリーン': 'green',
  'ピンク':   'pink',
  'ブラック': 'black',
};
const LIGHTING_EN = {
  'golden-hour':    'golden hour warm sunlight',
  'neon-reflection': 'neon reflections on glossy surfaces',
  'soft-ambient':   'soft ambient diffused lighting',
};
const ANGLE_EN = {
  'wide-angle': 'Shot with ultra wide-angle lens',
  'close-up':   'Close-up detail shot',
  'top-down':   'Top-down aerial view',
};

function generatePrompt() {
  // 選択済みアイテムのタグを集約
  const tags = aggregateTags(State.selectedItems);
  const refUrl = document.getElementById('ref-image-url').value;
  const lighting = State.promptOptions.lighting;
  const angle = State.promptOptions.angle;

  const catEn  = CATEGORY_EN[tags.category]  || tags.category  || 'decorative installation';
  const usageEn = USAGE_EN[tags.usage]        || tags.usage      || 'event';
  const toneEn  = TONE_EN[tags.tone]          || tags.tone       || 'elegant';
  const areaEn  = AREA_EN[tags.area]          || '';
  const colorEn = COLOR_EN[tags.color]        || tags.color      || '';
  const structEn = STRUCTURE_EN[tags.structure] || '';
  const lightEn = LIGHTING_EN[lighting]       || '';
  const angleEn = ANGLE_EN[angle]             || '';

  // nano banana Pro 黄金構文に沿った生成
  let prompt = '';

  // 主役
  prompt += `A ${structEn ? structEn + ' ' : ''}${catEn}`;

  // 環境
  if (areaEn) prompt += `, ${areaEn}`;
  prompt += `.`;

  // スタイル・用途・トーン
  prompt += `\n${toneEn.charAt(0).toUpperCase() + toneEn.slice(1)} decoration for a ${usageEn} setting`;
  if (colorEn) prompt += `, featuring ${colorEn} color palette`;
  prompt += `.`;

  // 照明
  if (lightEn) prompt += `\n${lightEn}.`;

  // 構図
  if (angleEn) prompt += `\n${angleEn}.`;

  // クオリティブースト
  prompt += `\nPhotorealistic, Highly detailed texture, Soft shadows, Depth of field, Shot on 35mm lens, f/1.8.`;

  // 参考画像がある場合
  if (refUrl) {
    prompt = `Based on this reference image style, create a similar composition.\n\n` + prompt;
  }

  return prompt;
}

function aggregateTags(items) {
  if (!items.length) return {};
  // 複数アイテムがある場合は最初のアイテムのタグを基準に
  const base = { ...items[0] };
  return base;
}

document.getElementById('generate-btn')?.addEventListener('click', () => {
  const prompt = generatePrompt();
  const outputEl = document.getElementById('prompt-output');
  const textEl = document.getElementById('prompt-output-text');
  textEl.textContent = prompt;
  outputEl.style.display = 'block';
  outputEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
});

document.getElementById('copy-prompt-btn')?.addEventListener('click', () => {
  const text = document.getElementById('prompt-output-text').textContent;
  navigator.clipboard.writeText(text).then(() => {
    showToast('クリップボードにコピーしました ✓');
  });
});

document.getElementById('regenerate-btn')?.addEventListener('click', () => {
  const prompt = generatePrompt();
  document.getElementById('prompt-output-text').textContent = prompt;
});

document.getElementById('save-prompt-btn')?.addEventListener('click', async () => {
  if (!State.selectedItems.length) return;
  const prompt = document.getElementById('prompt-output-text').textContent;
  for (const item of State.selectedItems) {
    await apiPost({ action: 'updateTags', id: item.id, prompt });
  }
  showToast('プロンプトを保存しました');
});

// ============================================================
// タグ付けモーダル
// ============================================================
function openTagModal(id) {
  const item = State.items.find(i => i.id === id);
  if (!item) return;
  State.currentItem = item;

  // サムネ
  const thumb = document.getElementById('modal-thumb');
  const src = item.thumb_url || item.ogp_thumb;
  thumb.src = src || '';
  thumb.style.display = src ? 'block' : 'none';

  document.getElementById('modal-item-title').textContent = item.file_name || '無題';

  // 既存タグを反映
  resetModalChips();
  const axes = ['category', 'usage', 'tone', 'color', 'area', 'cost', 'structure'];
  axes.forEach(axis => {
    if (item[axis]) {
      const el = document.getElementById(`modal-${axis}`);
      if (el) {
        const btn = el.querySelector(`[data-value="${item[axis]}"]`);
        if (btn) btn.classList.add('active');
      }
    }
  });
  document.getElementById('modal-memo').value = item.memo || '';

  document.getElementById('tag-modal').style.display = 'flex';
}

function closeTagModal() {
  document.getElementById('tag-modal').style.display = 'none';
  State.currentItem = null;
}

function resetModalChips() {
  document.querySelectorAll('.tag-chips .chip').forEach(b => b.classList.remove('active'));
}

function selectModalTag(axis, value, btn) {
  // 同軸は単一選択
  const parent = document.getElementById(`modal-${axis}`);
  if (parent) parent.querySelectorAll('.chip').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

document.getElementById('modal-close')?.addEventListener('click', closeTagModal);
document.getElementById('modal-skip')?.addEventListener('click', closeTagModal);

document.getElementById('modal-save')?.addEventListener('click', async () => {
  if (!State.currentItem) return;

  // 必須チェック
  const requiredAxes = ['category', 'usage', 'tone'];
  for (const axis of requiredAxes) {
    const el = document.getElementById(`modal-${axis}`);
    const selected = el?.querySelector('.chip.active');
    if (!selected) {
      showToast(`「${axisLabel(axis)}」を選択してください`);
      return;
    }
  }

  const updateData = { action: 'updateTags', id: State.currentItem.id };
  const axes = ['category', 'usage', 'tone', 'color', 'area', 'cost', 'structure'];
  axes.forEach(axis => {
    const el = document.getElementById(`modal-${axis}`);
    const selected = el?.querySelector('.chip.active');
    if (selected) updateData[axis] = selected.dataset.value;
  });
  updateData.memo = document.getElementById('modal-memo').value;

  const result = await apiPost(updateData);
  if (result?.success) {
    showToast('タグを保存しました ✓');
    closeTagModal();
    await loadItems(State.activeFilters);
    await renderStats();
  } else {
    showToast('保存に失敗しました');
  }
});

// ============================================================
// ファイルアップロード
// ============================================================
document.getElementById('file-input')?.addEventListener('change', async (e) => {
  const files = Array.from(e.target.files);
  for (const file of files) {
    await uploadFile(file);
  }
  e.target.value = '';
  await loadItems();
});

async function uploadFile(file) {
  if (!State.gasUrl) {
    showToast('設定からGASを接続してください');
    return;
  }
  showToast(`アップロード中... ${file.name}`);
  const base64 = await fileToBase64(file);
  const result = await apiPost({
    action: 'saveImageFile',
    fileName: file.name,
    mimeType: file.type,
    base64: base64.split(',')[1],
    category: '',
    registered_by: State.username,
  });
  if (result?.success) {
    showToast(`受信しました: ${file.name}`);
  } else {
    showToast('アップロードに失敗しました');
  }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ドラッグ＆ドロップ
const dropZone = document.getElementById('upload-drop-zone');
dropZone?.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone?.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone?.addEventListener('drop', async e => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
  for (const file of files) await uploadFile(file);
  await loadItems();
});

// ============================================================
// URLシェア受信
// ============================================================
document.getElementById('share-url-btn')?.addEventListener('click', async () => {
  const url = document.getElementById('share-url-input').value.trim();
  if (!url) return;
  if (!State.gasUrl) { showToast('設定からGASを接続してください'); return; }

  showToast('受信中...');
  const result = await apiPost({
    action: 'saveItem',
    url,
    source: State.selectedSource,
    registered_by: State.username,
  });
  if (result?.success) {
    document.getElementById('share-url-input').value = '';
    showToast('受信しました ✓');
    await loadItems();
    await renderStats();
  } else {
    showToast('受信に失敗しました');
  }
});

// ソース選択チップ
document.querySelectorAll('.source-chips .chip').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.source-chips .chip').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    State.selectedSource = btn.dataset.source;
  });
});

// ============================================================
// タブ切り替え
// ============================================================
document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(s => s.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${tab}`)?.classList.add('active');

    // プロンプトタブへ遷移したら選択表示を更新
    if (tab === 'prompt') renderSelectedThumbs();
  });
});

// ============================================================
// ビュー切替（グリッド/リスト）
// ============================================================
document.querySelectorAll('.view-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const grid = document.getElementById('results-grid');
    if (btn.dataset.view === 'list') grid.classList.add('list-view');
    else grid.classList.remove('list-view');
  });
});

// ============================================================
// プロンプトオプション
// ============================================================
document.querySelectorAll('[data-option]').forEach(btn => {
  btn.addEventListener('click', () => {
    const option = btn.dataset.option;
    document.querySelectorAll(`[data-option="${option}"]`).forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    State.promptOptions[option] = btn.dataset.value;
  });
});

// ============================================================
// 設定モーダル
// ============================================================
document.getElementById('settings-btn')?.addEventListener('click', () => {
  document.getElementById('settings-gas-url').value = State.gasUrl;
  document.getElementById('settings-username').value = State.username;
  document.getElementById('settings-modal').style.display = 'flex';
});
document.getElementById('settings-close')?.addEventListener('click', () => {
  document.getElementById('settings-modal').style.display = 'none';
});
document.getElementById('settings-save')?.addEventListener('click', async () => {
  State.gasUrl  = document.getElementById('settings-gas-url').value.trim();
  State.username = document.getElementById('settings-username').value.trim();
  localStorage.setItem('siftra_gas_url', State.gasUrl);
  localStorage.setItem('siftra_username', State.username);
  document.getElementById('settings-modal').style.display = 'none';
  showToast('設定を保存しました ✓');
  await loadTags();
  await loadItems();
  await renderStats();
});

// ============================================================
// ユーティリティ
// ============================================================
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2500);
}

function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
}

function sourceEmoji(source) {
  const map = {
    'Instagram': '📸',
    'Pinterest': '📌',
    'X': '𝕏',
    'TikTok': '🎵',
    'Web': '🌐',
    '自社撮影': '📷',
    'URL': '🔗',
  };
  return map[source] || '📁';
}

function axisLabel(axis) {
  const map = {
    category: 'カテゴリ',
    usage: '用途',
    tone: 'トーン',
    color: 'カラー',
    area: 'エリア',
    cost: 'コスト感',
    structure: '施工特性',
  };
  return map[axis] || axis;
}

// ============================================================
// PWA: Enterキーでシェア送信
// ============================================================
document.getElementById('share-url-input')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('share-url-btn').click();
});

// ============================================================
// 起動
// ============================================================
init();
