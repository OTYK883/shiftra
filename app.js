// ============================================================
// Siftra — app.js v5
// 削除・名称変更・一括タグ編集・テキスト検索・クリップサムネ改善
// ============================================================

// ============================================================
// 設定：localStorage + URLハッシュの両方から復元（iOS PWA対策）
// ============================================================
function loadSettings() {
  var hash = {};
  try {
    var raw = location.hash.replace('#','');
    if (raw) {
      atob(raw).split('|').forEach(function(pair) {
        var idx = pair.indexOf(':');
        if (idx > 0) hash[pair.substring(0, idx)] = pair.substring(idx + 1);
      });
    }
  } catch(e) {}
  return {
    gasUrl:   hash.g || localStorage.getItem('siftra_gas_url') || '',
    username: hash.u || localStorage.getItem('siftra_username') || '',
    apiKey:   localStorage.getItem('siftra_api_key') || '',
  };
}

function persistSettings(g, u, k) {
  localStorage.setItem('siftra_gas_url', g);
  localStorage.setItem('siftra_username', u);
  localStorage.setItem('siftra_api_key', k);
  try {
    var payload = btoa(['g:' + g, 'u:' + u].join('|'));
    history.replaceState(null, '', location.pathname + '#' + payload);
  } catch(e) {}
}

var _s       = loadSettings();
var gasUrl   = _s.gasUrl;
var username = _s.username || 'ユーザー';
var apiKey   = _s.apiKey;

var allItems      = [];
var allProjects   = [];
var selectedItems = [];     // プロンプト生成用（アーカイブのみ）
var activeFilters = {};
var activeProject = '';
var activeContentType = 'archive'; // 'archive' | 'clip'
var activeInboxType   = 'all';     // 'all' | 'clip' | 'archive'
var selectedSource    = 'Instagram';
var promptOptions     = { angle: '', lighting: '' };
var currentItemId     = null;
var pendingItem       = null;
var selectedProjectColor = '#e8a020';
var searchQuery = '';

// 一括編集
var bulkEditMode    = false;
var bulkSelectedIds = [];

// 削除確認コールバック
var deleteConfirmCallback = null;

// リネーム対象
var renameTargetId = null;

var MULTI_SELECT_AXES = ['area', 'tone'];

var tags = {
  category: ['すぐ見て','実績資料','案件資料','宣伝PR','イベント','雑学','AI情報','勉強用','BIZ資料','注意喚起','なんでもBOX'],
  usage:    ['AI界','BIZ界','宣伝界','雑学界','装飾(演)','照明(演)','映像(演)','機材工具','部材資料','技法工法'],
  area:     ['屋内','屋外','小型','大型','ゲート','ステージ','キッズエリア','導線','展示','フォトスポ','看板','エントランス','その他'],
  tone:     ['エレガント','ポップ','ラグジュアリー','クール','キッズ','シンプル','モノトン','カラフル','ネイチャー','フラワー','ビビット','派手','地味'],
};

// ============================================================
// isClip: URLシェア由来 = クリップ / ファイル = アーカイブ
// ============================================================
function isClip(item) {
  return item.file_type === 'link' || (!item.file_type && item.origin_url && !item.drive_url);
}

// ============================================================
// 起動
// ============================================================
window.addEventListener('DOMContentLoaded', function() {
  setTimeout(function() {
    var ls = document.getElementById('loading-screen');
    if (ls) ls.classList.add('hidden');
  }, 1500);

  renderFilterChips();
  renderModalTagChips();
  renderBulkModalChips();
  renderUntaggedList([]);
  renderResultsGrid([]);

  var hStats = document.getElementById('header-stats');
  if (hStats) hStats.textContent = gasUrl ? 'connecting...' : 'GAS未接続';

  if (gasUrl) { fetchProjects(); fetchItems({}); }

  setupNav();
  setupSettings();
  setupShareInput();
  setupFileUpload();
  setupFilters();
  setupSearch();
  setupContentTypeTabs();
  setupInboxTypeTabs();
  setupTagModal();
  setupAnalyzeModal();
  setupProjectModal();
  setupBulkEdit();
  setupDeleteConfirm();
  setupRenameModal();
  setupPrompt();
  setupViewToggle();
  setupPWA();
});

// ============================================================
// ナビ
// ============================================================
function setupNav() {
  document.querySelectorAll('.nav-item').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var tab = btn.getAttribute('data-tab');
      document.querySelectorAll('.nav-item').forEach(function(b) { b.classList.remove('active'); });
      document.querySelectorAll('.tab-content').forEach(function(s) { s.classList.remove('active'); });
      btn.classList.add('active');
      var el = document.getElementById('tab-' + tab);
      if (el) el.classList.add('active');
      if (tab === 'prompt') renderSelectedThumbs();
    });
  });
}

// ============================================================
// 設定
// ============================================================
function setupSettings() {
  // GAS URL未設定なら起動時に自動表示（iOS PWAでlocalStorage消去後の復旧）
  if (!gasUrl) {
    setTimeout(function() {
      document.getElementById('settings-gas-url').value = '';
      document.getElementById('settings-username').value = username || '';
      document.getElementById('settings-api-key').value = apiKey || '';
      document.getElementById('settings-modal').style.display = 'flex';
      showToast('⚙️ GASのURLを設定してください');
    }, 800);
  }

  var sBtn = document.getElementById('settings-btn');
  if (sBtn) sBtn.addEventListener('click', function() {
    document.getElementById('settings-gas-url').value = gasUrl;
    document.getElementById('settings-username').value = username;
    document.getElementById('settings-api-key').value = apiKey;
    document.getElementById('settings-modal').style.display = 'flex';
  });
  var sClose = document.getElementById('settings-close');
  if (sClose) sClose.addEventListener('click', function() { document.getElementById('settings-modal').style.display = 'none'; });
  var sSave = document.getElementById('settings-save');
  if (sSave) sSave.addEventListener('click', function() {
    gasUrl   = document.getElementById('settings-gas-url').value.trim();
    username = document.getElementById('settings-username').value.trim();
    apiKey   = document.getElementById('settings-api-key').value.trim();
    persistSettings(gasUrl, username, apiKey);
    document.getElementById('settings-modal').style.display = 'none';
    showToast('設定を保存しました ✓');
    if (gasUrl) { fetchProjects(); fetchItems({}); }
  });
}

// ============================================================
// テキスト検索
// ============================================================
function setupSearch() {
  var input = document.getElementById('search-text-input');
  var clearBtn = document.getElementById('search-clear-btn');
  if (!input) return;

  input.addEventListener('input', function() {
    searchQuery = input.value.trim();
    if (clearBtn) clearBtn.style.display = searchQuery ? 'flex' : 'none';
    renderResultsGrid(filteredItems());
    var rc = document.getElementById('results-count');
    if (rc) rc.textContent = filteredItems().length + ' 件';
  });

  if (clearBtn) clearBtn.addEventListener('click', function() {
    input.value = '';
    searchQuery = '';
    clearBtn.style.display = 'none';
    renderResultsGrid(filteredItems());
  });
}

// ============================================================
// コンテンツタイプタブ（検索）
// ============================================================
function setupContentTypeTabs() {
  document.querySelectorAll('.content-type-tab').forEach(function(btn) {
    btn.addEventListener('click', function() {
      document.querySelectorAll('.content-type-tab').forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
      activeContentType = btn.getAttribute('data-content-type');
      // 一括モードを解除
      if (bulkEditMode) exitBulkMode();
      renderResultsGrid(filteredItems());
    });
  });
}

function filteredItems() {
  var items = allItems.filter(function(item) {
    if (activeContentType === 'archive') return !isClip(item);
    if (activeContentType === 'clip')    return isClip(item);
    return true;
  });
  // テキスト検索
  if (searchQuery) {
    var q = searchQuery.toLowerCase();
    items = items.filter(function(i) {
      return ['file_name','ai_summary','memo','origin_url','source','category','usage','area','tone','project_id']
        .some(function(k) { return i[k] && String(i[k]).toLowerCase().includes(q); });
    });
  }
  return items;
}

// ============================================================
// 受信ボックス種別トグル
// ============================================================
function setupInboxTypeTabs() {
  document.querySelectorAll('.inbox-type-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      document.querySelectorAll('.inbox-type-btn').forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
      activeInboxType = btn.getAttribute('data-type');
      var untagged = allItems.filter(function(i) { return !i.category; });
      renderUntaggedList(untagged);
    });
  });
}

// ============================================================
// URLシェア受信（→ クリップ）
// ============================================================
function setupShareInput() {
  document.querySelectorAll('.source-chips .chip').forEach(function(btn) {
    btn.addEventListener('click', function() {
      document.querySelectorAll('.source-chips .chip').forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
      selectedSource = btn.getAttribute('data-source');
    });
  });
  var shareBtn = document.getElementById('share-url-btn');
  if (shareBtn) shareBtn.addEventListener('click', doShareUrl);
  var shareInput = document.getElementById('share-url-input');
  if (shareInput) shareInput.addEventListener('keydown', function(e) { if (e.key === 'Enter') doShareUrl(); });
}

async function doShareUrl() {
  var url = document.getElementById('share-url-input').value.trim();
  if (!url) return;
  if (!gasUrl) { showToast('設定からGAS URLを入力してください'); return; }

  var shareBtn = document.getElementById('share-url-btn');
  if (shareBtn) { shareBtn.disabled = true; shareBtn.textContent = '受信中...'; }
  showToast('📎 クリップ受信・分析中...');

  try {
    var result = null;
    try {
      result = await apiPost({ action: 'saveItem', url: url, source: selectedSource, registered_by: username, file_type: 'link' });
    } catch(e) { console.error('GAS saveItem失敗:', e); }

    var savedId  = (result && result.id)       || ('tmp_' + Date.now());
    var ogpTitle = (result && result.ogpTitle)  || '';
    var ogpThumb = (result && result.ogpThumb)  || '';
    var ogpDesc  = (result && result.ogpDesc)   || '';

    document.getElementById('share-url-input').value = '';

    var aiResult = { category: '', usage: '', area: '', tone: '', summary: ogpDesc };
    if (apiKey) {
      try {
        aiResult = await analyzeWithAI({ title: ogpTitle, summary: ogpDesc, url: url, source: selectedSource, imageUrl: ogpThumb });
      } catch(e) { console.error('AI分析失敗:', e); }
    }

    var displayTitle = ogpTitle || aiResult.summary || url.substring(0, 60);

    pendingItem = {
      id:          savedId,
      title:       displayTitle,
      thumb:       ogpThumb,
      origin_url:  url,
      summary:     aiResult.summary || ogpDesc,
      file_type:   'link',
      ai_category: aiResult.category || '',
      ai_usage:    aiResult.usage    || '',
      ai_area:     aiResult.area     || '',
      ai_tone:     aiResult.tone     || '',
      ai_tags:     [aiResult.category, aiResult.usage].filter(Boolean).join(','),
    };
    openAnalyzeModal(pendingItem);

  } catch(e) {
    console.error('doShareUrl全体エラー:', e);
    showToast('エラー: ' + e.message);
  } finally {
    if (shareBtn) { shareBtn.disabled = false; shareBtn.textContent = '受信'; }
  }
}

// ============================================================
// ファイルアップロード（→ アーカイブ）
// ============================================================
function setupFileUpload() {
  var fileInput = document.getElementById('file-input');
  if (fileInput) fileInput.addEventListener('change', function(e) {
    uploadFiles(Array.from(e.target.files)).then(function() { e.target.value = ''; fetchItems({}); });
  });
  var dropZone = document.getElementById('upload-drop-zone');
  if (dropZone) {
    dropZone.addEventListener('dragover', function(e) { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', function() { dropZone.classList.remove('drag-over'); });
    dropZone.addEventListener('drop', function(e) {
      e.preventDefault(); dropZone.classList.remove('drag-over');
      uploadFiles(Array.from(e.dataTransfer.files)).then(function() { fetchItems({}); });
    });
  }
}

function uploadFiles(files) {
  if (!gasUrl) { showToast('設定からGAS URLを入力してください'); return Promise.resolve(); }
  return Promise.all(files.map(function(file) {
    return new Promise(function(resolve, reject) {
      var reader = new FileReader();
      reader.onload = function(e) { resolve(e.target.result); };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    }).then(function(b64) {
      showToast('🖼 アップロード中: ' + file.name);
      var fileType = file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : 'file';
      return apiPost({ action: 'saveImageFile', fileName: file.name, mimeType: file.type, base64: b64.split(',')[1], category: '', registered_by: username, file_type: fileType });
    }).then(function(result) {
      if (result && result.success) {
        showToast('完了: ' + file.name);
        pendingItem = { id: result.id, title: file.name, thumb: result.thumbUrl || '', origin_url: '', summary: '', file_type: result.file_type || 'image', ai_category: '', ai_usage: '', ai_area: '', ai_tone: '', ai_tags: '' };
        openAnalyzeModal(pendingItem);
      } else { showToast('失敗: ' + file.name); }
    });
  }));
}

// ============================================================
// AI分析
// ============================================================
async function analyzeWithAI(info) {
  var systemPrompt = [
    'あなたはSiftraのAI分析エンジンです。受け取った情報を分析し、以下のJSONのみを返してください。',
    '```json',
    '{ "category": "カテゴリ1つ", "usage": "用途1つ", "area": "エリア（複数可、カンマ区切り）", "tone": "トンマナ（複数可、カンマ区切り）", "summary": "日本語要約50文字以内" }',
    '```',
    '【カテゴリ】すぐ見て/実績資料/案件資料/宣伝PR/イベント/雑学/AI情報/勉強用/BIZ資料/注意喚起/なんでもBOX',
    '【用途】AI界/BIZ界/宣伝界/雑学界/装飾(演)/照明(演)/映像(演)/機材工具/部材資料/技法工法',
    '【エリア】屋内/屋外/小型/大型/ゲート/ステージ/キッズエリア/導線/展示/フォトスポ/看板/エントランス/その他',
    '【トンマナ】エレガント/ポップ/ラグジュアリー/クール/キッズ/シンプル/モノトン/カラフル/ネイチャー/フラワー/ビビット/派手/地味',
    'JSONのみ返してください。',
  ].join('\n');

  var textContent = ['URL: ' + info.url, 'ソース: ' + info.source, 'タイトル: ' + (info.title || '不明'), '概要: ' + (info.summary || '不明')].join('\n');
  var messages = info.imageUrl
    ? [{ role: 'user', content: [{ type: 'image', source: { type: 'url', url: info.imageUrl } }, { type: 'text', text: textContent }] }]
    : [{ role: 'user', content: textContent }];

  var response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
    body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 300, system: systemPrompt, messages: messages })
  });
  var data = await response.json();
  var text = (data.content && data.content[0] ? data.content[0].text : '{}').replace(/```json|```/g, '').trim();
  return JSON.parse(text);
}

// ============================================================
// AI分析確認モーダル
// ============================================================
function setupAnalyzeModal() {
  ['category','usage','area','tone'].forEach(function(axis) {
    var el = document.getElementById('analyze-' + axis);
    if (!el) return;
    var isMulti = MULTI_SELECT_AXES.indexOf(axis) >= 0;
    el.innerHTML = (tags[axis] || []).map(function(tag) {
      return '<button class="chip ' + (isMulti ? 'multi' : '') + '" data-axis="' + axis + '" data-value="' + tag + '" onclick="selectModalTag(\'' + axis + '\',\'' + tag + '\',this)">' + esc(tag) + '</button>';
    }).join('');
  });

  var closeBtn = document.getElementById('analyze-close');
  if (closeBtn) closeBtn.addEventListener('click', function() { document.getElementById('analyze-modal').style.display = 'none'; fetchItems({}); });
  var skipBtn = document.getElementById('analyze-skip');
  if (skipBtn) skipBtn.addEventListener('click', function() { document.getElementById('analyze-modal').style.display = 'none'; fetchItems({}); });
  var saveBtn = document.getElementById('analyze-save');
  if (saveBtn) saveBtn.addEventListener('click', saveAnalyzeModal);
}

function openAnalyzeModal(item) {
  var typeRow = document.getElementById('analyze-type-row');
  if (typeRow) {
    var isC = item.file_type === 'link';
    typeRow.innerHTML = '<span class="type-badge ' + (isC ? 'clip' : 'archive') + '">' + (isC ? '📎 クリップ（参考情報・リンク）' : '🖼 アーカイブ（画像・ファイル）') + '</span>';
  }

  var thumb = document.getElementById('analyze-thumb');
  if (thumb) { thumb.src = item.thumb || ''; thumb.style.display = item.thumb ? 'block' : 'none'; }

  document.getElementById('analyze-title').textContent = item.title || '無題';
  document.getElementById('analyze-summary').textContent = item.summary || '';

  var urlLink = document.getElementById('analyze-origin-url');
  if (urlLink) {
    if (item.origin_url) { urlLink.href = item.origin_url; urlLink.style.display = 'inline-block'; }
    else { urlLink.style.display = 'none'; }
  }

  document.querySelectorAll('#analyze-modal .tag-chips .chip').forEach(function(b) { b.classList.remove('active'); });

  if (item.ai_category) preSelectChip('analyze-category', item.ai_category);
  if (item.ai_usage)    preSelectChip('analyze-usage',    item.ai_usage);
  if (item.ai_area)  item.ai_area.split(',').forEach(function(v) { preSelectChip('analyze-area', v.trim()); });
  if (item.ai_tone)  item.ai_tone.split(',').forEach(function(v) { preSelectChip('analyze-tone', v.trim()); });

  renderProjectChipsInModals();
  document.getElementById('analyze-memo').value = '';
  document.getElementById('analyze-modal').style.display = 'flex';
}

function preSelectChip(containerId, value) {
  var el = document.getElementById(containerId);
  if (!el || !value) return;
  var btn = el.querySelector('[data-value="' + value + '"]');
  if (btn) btn.classList.add('active');
}

function saveAnalyzeModal() {
  if (!pendingItem) return;
  var required = ['category','usage'];
  for (var i = 0; i < required.length; i++) {
    var el = document.getElementById('analyze-' + required[i]);
    if (!el || !el.querySelector('.chip.active')) { showToast(axisLabel(required[i]) + ' を選択してください'); return; }
  }
  var data = { action: 'updateTags', id: pendingItem.id };
  ['category','usage','area','tone'].forEach(function(axis) {
    var el = document.getElementById('analyze-' + axis);
    if (!el) return;
    var selected = Array.from(el.querySelectorAll('.chip.active')).map(function(b) { return b.getAttribute('data-value'); });
    if (selected.length) data[axis] = selected.join(',');
  });
  var projEl = document.getElementById('analyze-project');
  if (projEl) { var ps = projEl.querySelector('.chip.active'); if (ps) data.project_id = ps.getAttribute('data-value'); }
  var memo = document.getElementById('analyze-memo');
  if (memo) data.memo = memo.value;
  data.ai_summary = pendingItem.summary;
  data.ai_tags    = pendingItem.ai_tags;

  apiPost(data).then(function(result) {
    if (result && result.success) {
      showToast('保存しました ✓');
      document.getElementById('analyze-modal').style.display = 'none';
      pendingItem = null;
      fetchItems({});
    } else { showToast('保存に失敗しました'); }
  });
}

// ============================================================
// フィルター
// ============================================================
function setupFilters() {
  var applyBtn = document.getElementById('filter-apply');
  if (applyBtn) applyBtn.addEventListener('click', function() {
    var filters = Object.assign({}, activeFilters);
    if (activeProject) filters.project = activeProject;
    fetchItems(filters);
  });
  var resetBtn = document.getElementById('filter-reset');
  if (resetBtn) resetBtn.addEventListener('click', function() {
    activeFilters = {}; activeProject = '';
    searchQuery = '';
    var inp = document.getElementById('search-text-input');
    if (inp) inp.value = '';
    var clearBtn = document.getElementById('search-clear-btn');
    if (clearBtn) clearBtn.style.display = 'none';
    document.querySelectorAll('.filter-chips .chip').forEach(function(b) { b.classList.remove('active'); });
    renderProjectFilterBar();
    fetchItems({});
  });
}

function toggleFilter(axis, value, btn) {
  if (activeFilters[axis] === value) { delete activeFilters[axis]; btn.classList.remove('active'); }
  else {
    document.querySelectorAll('.filter-chips [data-axis="' + axis + '"]').forEach(function(b) { b.classList.remove('active'); });
    activeFilters[axis] = value; btn.classList.add('active');
  }
}

// ============================================================
// プロジェクト
// ============================================================
function fetchProjects() {
  apiGet({ action: 'getProjects' }).then(function(data) {
    if (data && data.projects) {
      allProjects = data.projects;
      renderProjectList();
      renderProjectFilterBar();
      renderProjectChipsInModals();
    }
  });
}

function renderProjectList() {
  var el = document.getElementById('project-list');
  if (!el) return;
  if (!allProjects.length) { el.innerHTML = '<div class="empty-state">案件フォルダがありません</div>'; return; }
  el.innerHTML = allProjects.map(function(p) {
    var count = allItems.filter(function(i) { return i.project_id === p.id; }).length;
    return '<div class="project-card">' +
      '<div class="project-color-dot" style="background:' + esc(p.color || '#e8a020') + '" onclick="filterByProject(\'' + p.id + '\')"></div>' +
      '<div class="project-info" onclick="filterByProject(\'' + p.id + '\')">' +
        '<div class="project-name">' + esc(p.name) + '</div>' +
        '<div class="project-meta">' + formatDate(p.created_at) + ' · ' + esc(p.created_by) + '</div>' +
      '</div>' +
      '<div class="project-count">' + count + ' 件</div>' +
      '<div class="project-actions">' +
        '<button class="project-action-btn" onclick="openRenameProject(\'' + p.id + '\',\'' + esc(p.name) + '\')" title="名称変更">✏</button>' +
        '<button class="project-action-btn danger" onclick="openDeleteProject(\'' + p.id + '\',\'' + esc(p.name) + '\')" title="削除">🗑</button>' +
      '</div>' +
    '</div>';
  }).join('');
}

function renderProjectFilterBar() {
  var bar = document.getElementById('project-filter-bar');
  if (!bar) return;
  bar.innerHTML = '<button class="project-chip ' + (activeProject === '' ? 'active' : '') + '" data-project="" onclick="filterByProject(\'\')">すべて</button>' +
    allProjects.map(function(p) {
      var isActive = activeProject === p.id;
      return '<button class="project-chip ' + (isActive ? 'active' : '') + '" data-project="' + p.id + '" onclick="filterByProject(\'' + p.id + '\')">' +
        '<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:' + esc(p.color || '#e8a020') + ';margin-right:5px;vertical-align:middle"></span>' +
        esc(p.name) + '</button>';
    }).join('');
}

function renderProjectChipsInModals() {
  ['modal-project','analyze-project','bulk-project'].forEach(function(elId) {
    var el = document.getElementById(elId);
    if (!el) return;
    el.innerHTML = '<button class="chip" data-axis="project" data-value="" onclick="selectModalTag(\'project\',\'\',this)">なし</button>' +
      allProjects.map(function(p) {
        return '<button class="chip" data-axis="project" data-value="' + p.id + '" onclick="selectModalTag(\'project\',\'' + p.id + '\',this)">' +
          '<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:' + esc(p.color || '#e8a020') + ';margin-right:4px;vertical-align:middle"></span>' +
          esc(p.name) + '</button>';
      }).join('');
  });
}

function filterByProject(projectId) {
  activeProject = projectId;
  renderProjectFilterBar();
  var filters = Object.assign({}, activeFilters);
  if (projectId) filters.project = projectId;
  fetchItems(filters);
  document.querySelectorAll('.nav-item').forEach(function(b) { b.classList.remove('active'); });
  document.querySelectorAll('.tab-content').forEach(function(s) { s.classList.remove('active'); });
  var sn = document.querySelector('[data-tab="search"]'); if (sn) sn.classList.add('active');
  var st = document.getElementById('tab-search'); if (st) st.classList.add('active');
}

function setupProjectModal() {
  var newBtn = document.getElementById('new-project-btn');
  if (newBtn) newBtn.addEventListener('click', function() {
    document.getElementById('project-name-input').value = '';
    document.getElementById('project-modal').style.display = 'flex';
  });
  ['project-modal-close','project-modal-cancel'].forEach(function(id) {
    var b = document.getElementById(id);
    if (b) b.addEventListener('click', function() { document.getElementById('project-modal').style.display = 'none'; });
  });
  document.querySelectorAll('.color-chip').forEach(function(btn) {
    btn.addEventListener('click', function() {
      document.querySelectorAll('.color-chip').forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
      selectedProjectColor = btn.getAttribute('data-color');
    });
  });
  var saveBtn = document.getElementById('project-modal-save');
  if (saveBtn) saveBtn.addEventListener('click', function() {
    var name = document.getElementById('project-name-input').value.trim();
    if (!name) { showToast('案件名を入力してください'); return; }
    if (!gasUrl) { showToast('GASを接続してください'); return; }
    showToast('作成中...');
    apiPost({ action: 'createProject', name: name, created_by: username, color: selectedProjectColor })
      .then(function(result) {
        if (result && result.success) {
          document.getElementById('project-modal').style.display = 'none';
          showToast('案件フォルダを作成しました ✓');
          fetchProjects();
        } else { showToast('作成に失敗しました'); }
      });
  });
}

// ============================================================
// プロジェクト名称変更
// ============================================================
function setupRenameModal() {
  var closeBtn = document.getElementById('rename-modal-close');
  if (closeBtn) closeBtn.addEventListener('click', function() { document.getElementById('rename-modal').style.display = 'none'; renameTargetId = null; });
  var cancelBtn = document.getElementById('rename-cancel');
  if (cancelBtn) cancelBtn.addEventListener('click', function() { document.getElementById('rename-modal').style.display = 'none'; renameTargetId = null; });
  var saveBtn = document.getElementById('rename-save');
  if (saveBtn) saveBtn.addEventListener('click', function() {
    var name = document.getElementById('rename-input').value.trim();
    if (!name) { showToast('案件名を入力してください'); return; }
    if (!renameTargetId) return;
    apiPost({ action: 'renameProject', id: renameTargetId, name: name }).then(function(result) {
      if (result && result.success) {
        document.getElementById('rename-modal').style.display = 'none';
        showToast('名称を変更しました ✓');
        renameTargetId = null;
        fetchProjects();
      } else { showToast('変更に失敗しました'); }
    });
  });
}

function openRenameProject(id, currentName) {
  renameTargetId = id;
  document.getElementById('rename-input').value = currentName;
  document.getElementById('rename-modal').style.display = 'flex';
}

// ============================================================
// 削除確認
// ============================================================
function setupDeleteConfirm() {
  var cancelBtn = document.getElementById('delete-cancel-btn');
  if (cancelBtn) cancelBtn.addEventListener('click', function() {
    document.getElementById('delete-confirm-modal').style.display = 'none';
    deleteConfirmCallback = null;
  });
  var confirmBtn = document.getElementById('delete-confirm-btn');
  if (confirmBtn) confirmBtn.addEventListener('click', function() {
    document.getElementById('delete-confirm-modal').style.display = 'none';
    if (deleteConfirmCallback) { deleteConfirmCallback(); deleteConfirmCallback = null; }
  });
}

function openDeleteConfirm(title, desc, callback) {
  document.getElementById('delete-confirm-title').textContent = title || '削除しますか？';
  document.getElementById('delete-confirm-desc').textContent = desc || 'この操作は取り消せません';
  deleteConfirmCallback = callback;
  document.getElementById('delete-confirm-modal').style.display = 'flex';
}

// アイテム削除
function openDeleteItem(id) {
  var item = allItems.find(function(i) { return i.id === id; });
  var name = item ? (item.file_name || item.ai_summary || '無題') : 'このアイテム';
  openDeleteConfirm('「' + name + '」を削除', 'スプレッドシートから削除されます', function() {
    doDeleteItem(id);
  });
}

function doDeleteItem(id) {
  if (!gasUrl) { showToast('GASを接続してください'); return; }
  apiPost({ action: 'deleteItem', id: id }).then(function(result) {
    if (result && result.success) {
      allItems = allItems.filter(function(i) { return i.id !== id; });
      selectedItems = selectedItems.filter(function(i) { return i.id !== id; });
      bulkSelectedIds = bulkSelectedIds.filter(function(bid) { return bid !== id; });
      showToast('削除しました');
      document.getElementById('tag-modal').style.display = 'none';
      renderUntaggedList(allItems.filter(function(i) { return !i.category; }));
      renderResultsGrid(filteredItems());
      renderProjectList();
      updateCounts();
    } else { showToast('削除に失敗しました'); }
  });
}

// プロジェクト削除
function openDeleteProject(id, name) {
  openDeleteConfirm('「' + name + '」を削除', 'フォルダ内アイテムのproject_idはリセットされます', function() {
    doDeleteProject(id);
  });
}

function doDeleteProject(id) {
  if (!gasUrl) { showToast('GASを接続してください'); return; }
  apiPost({ action: 'deleteProject', id: id }).then(function(result) {
    if (result && result.success) {
      showToast('プロジェクトを削除しました');
      fetchProjects();
      fetchItems({});
    } else { showToast('削除に失敗しました'); }
  });
}

// ============================================================
// 一括タグ編集
// ============================================================
function setupBulkEdit() {
  var toggleBtn = document.getElementById('bulk-toggle-btn');
  if (toggleBtn) toggleBtn.addEventListener('click', function() {
    if (bulkEditMode) exitBulkMode();
    else enterBulkMode();
  });

  var cancelBtn = document.getElementById('bulk-cancel-btn');
  if (cancelBtn) cancelBtn.addEventListener('click', exitBulkMode);

  var tagBtn = document.getElementById('bulk-tag-btn');
  if (tagBtn) tagBtn.addEventListener('click', openBulkModal);

  var closeBtn = document.getElementById('bulk-modal-close');
  if (closeBtn) closeBtn.addEventListener('click', function() { document.getElementById('bulk-modal').style.display = 'none'; });

  var cancelModal = document.getElementById('bulk-modal-cancel');
  if (cancelModal) cancelModal.addEventListener('click', function() { document.getElementById('bulk-modal').style.display = 'none'; });

  var saveModal = document.getElementById('bulk-modal-save');
  if (saveModal) saveModal.addEventListener('click', saveBulkTags);
}

function renderBulkModalChips() {
  ['category','usage','area','tone'].forEach(function(axis) {
    var el = document.getElementById('bulk-' + axis);
    if (!el) return;
    var isMulti = MULTI_SELECT_AXES.indexOf(axis) >= 0;
    el.innerHTML = (tags[axis] || []).map(function(tag) {
      return '<button class="chip ' + (isMulti ? 'multi' : '') + '" data-axis="' + axis + '" data-value="' + tag + '" onclick="selectModalTag(\'' + axis + '\',\'' + tag + '\',this)">' + esc(tag) + '</button>';
    }).join('');
  });
}

function enterBulkMode() {
  bulkEditMode = true;
  bulkSelectedIds = [];
  var toggleBtn = document.getElementById('bulk-toggle-btn');
  if (toggleBtn) toggleBtn.classList.add('active');
  var bar = document.getElementById('bulk-action-bar');
  if (bar) bar.style.display = 'flex';
  updateBulkCount();
  renderResultsGrid(filteredItems());
}

function exitBulkMode() {
  bulkEditMode = false;
  bulkSelectedIds = [];
  var toggleBtn = document.getElementById('bulk-toggle-btn');
  if (toggleBtn) toggleBtn.classList.remove('active');
  var bar = document.getElementById('bulk-action-bar');
  if (bar) bar.style.display = 'none';
  renderResultsGrid(filteredItems());
}

function toggleBulkSelect(id) {
  var idx = bulkSelectedIds.indexOf(id);
  if (idx >= 0) bulkSelectedIds.splice(idx, 1);
  else bulkSelectedIds.push(id);
  updateBulkCount();
  renderResultsGrid(filteredItems());
}

function updateBulkCount() {
  var el = document.getElementById('bulk-action-count');
  if (el) el.textContent = bulkSelectedIds.length + '件選択中';
  var tagBtn = document.getElementById('bulk-tag-btn');
  if (tagBtn) tagBtn.disabled = bulkSelectedIds.length === 0;
}

function openBulkModal() {
  if (!bulkSelectedIds.length) { showToast('アイテムを選択してください'); return; }
  // チップリセット
  document.querySelectorAll('#bulk-modal .chip').forEach(function(b) { b.classList.remove('active'); });
  renderProjectChipsInModals();
  var cnt = document.getElementById('bulk-modal-count');
  if (cnt) cnt.textContent = bulkSelectedIds.length;
  document.getElementById('bulk-modal').style.display = 'flex';
}

function saveBulkTags() {
  if (!bulkSelectedIds.length) return;
  if (!gasUrl) { showToast('GASを接続してください'); return; }

  var data = {};
  ['category','usage','area','tone'].forEach(function(axis) {
    var el = document.getElementById('bulk-' + axis);
    if (!el) return;
    var selected = Array.from(el.querySelectorAll('.chip.active')).map(function(b) { return b.getAttribute('data-value'); });
    if (selected.length) data[axis] = selected.join(',');
  });
  var projEl = document.getElementById('bulk-project');
  if (projEl) { var ps = projEl.querySelector('.chip.active'); if (ps && ps.getAttribute('data-value')) data.project_id = ps.getAttribute('data-value'); }

  if (!Object.keys(data).length) { showToast('タグを1つ以上選択してください'); return; }

  var total = bulkSelectedIds.length;
  var done  = 0;
  showToast('適用中... 0/' + total);

  Promise.all(bulkSelectedIds.map(function(id) {
    return apiPost(Object.assign({ action: 'updateTags', id: id }, data)).then(function() {
      done++;
      if (done === total) showToast('一括タグ付け完了 ✓ ' + total + '件');
    });
  })).then(function() {
    document.getElementById('bulk-modal').style.display = 'none';
    exitBulkMode();
    fetchItems(activeFilters);
  });
}

// ============================================================
// API
// ============================================================
function apiGet(params) {
  if (!gasUrl) return Promise.resolve(null);
  var url = new URL(gasUrl);
  Object.keys(params).forEach(function(k) { url.searchParams.set(k, params[k]); });
  return fetch(url.toString()).then(function(r) { return r.json(); }).catch(function(e) { console.error(e); return null; });
}
function apiPost(data) {
  if (!gasUrl) return Promise.resolve(null);
  return fetch(gasUrl, { method: 'POST', body: JSON.stringify(data) })
    .then(function(r) { return r.json(); }).catch(function(e) { console.error(e); return null; });
}

// ============================================================
// データ取得
// ============================================================
function fetchItems(filters) {
  var params = Object.assign({ action: 'getItems' }, filters);
  apiGet(params).then(function(data) {
    if (data && !data.error) {
      allItems = data.items || [];
      var untagged = allItems.filter(function(i) { return !i.category; });
      renderUntaggedList(untagged);
      renderResultsGrid(filteredItems());
      renderProjectList();
      updateCounts();
    }
  });
}

function updateCounts() {
  var total    = allItems.length;
  var clips    = allItems.filter(isClip).length;
  var archives = allItems.filter(function(i) { return !isClip(i); }).length;
  var untagged = allItems.filter(function(i) { return !i.category; }).length;

  var hStats = document.getElementById('header-stats');
  if (hStats) hStats.textContent = 'total ' + total + ' items';
  var ic = document.getElementById('inbox-count');
  if (ic) ic.textContent = untagged;
  var ac = document.getElementById('archive-count');
  if (ac) ac.textContent = archives;
  var cc = document.getElementById('clip-count');
  if (cc) cc.textContent = clips;
  var rc = document.getElementById('results-count');
  if (rc) rc.textContent = filteredItems().length + ' 件';
}

// ============================================================
// RENDER: 未タグ一覧
// ============================================================
function renderUntaggedList(items) {
  var el = document.getElementById('untagged-list');
  if (!el) return;

  var filtered = items.filter(function(item) {
    if (activeInboxType === 'clip')    return isClip(item);
    if (activeInboxType === 'archive') return !isClip(item);
    return true;
  });

  if (!filtered.length) { el.innerHTML = '<div class="empty-state">未確定のアイテムはありません ✓</div>'; return; }
  el.innerHTML = filtered.map(function(item) {
    var src = item.thumb_url || item.ogp_thumb || '';
    var clip = isClip(item);

    var thumbHtml;
    if (src) {
      thumbHtml = '<img class="untagged-thumb" src="' + esc(src) + '" alt="" loading="lazy" />';
    } else if (clip) {
      thumbHtml = '<div class="untagged-thumb clip-fallback-thumb ' + getSourceClass(item.source) + '">' +
        '<span class="clip-fb-emoji">' + sourceEmoji(item.source) + '</span>' +
        '<span class="clip-fb-domain">' + getDomain(item.origin_url) + '</span>' +
        '</div>';
    } else {
      thumbHtml = '<div class="untagged-thumb url-thumb">' + fileTypeEmoji(item.file_type, item.source) + '</div>';
    }

    var displayTitle = item.file_name || item.ai_summary || (item.origin_url ? item.origin_url.substring(0, 50) : '無題');
    var summaryHtml  = (item.ai_summary && item.ai_summary !== displayTitle) ? '<div class="untagged-summary">' + esc(item.ai_summary) + '</div>' : '';
    var urlHtml      = item.origin_url
      ? '<a class="untagged-url-link" href="' + esc(item.origin_url) + '" target="_blank" rel="noopener" onclick="event.stopPropagation()">🔗 元リンクを開く</a>'
      : '';
    var typeBadge = '<span class="untagged-type-badge ' + (clip ? 'clip' : 'archive') + '">' + (clip ? '📎' : '🖼') + '</span>';

    return '<div class="untagged-item" onclick="openTagModal(\'' + item.id + '\')">' +
      thumbHtml +
      '<div class="untagged-info">' +
        '<div class="untagged-title">' + typeBadge + ' ' + esc(displayTitle) + '</div>' +
        summaryHtml + urlHtml +
        '<div class="untagged-meta">' + esc(item.source || '') + '　' + formatDate(item.created_at) + '</div>' +
      '</div>' +
      '<button class="untagged-delete-btn" onclick="event.stopPropagation();openDeleteItem(\'' + item.id + '\')" title="削除">🗑</button>' +
    '</div>';
  }).join('');
}

// ============================================================
// RENDER: 検索結果
// ============================================================
function renderResultsGrid(items) {
  var el = document.getElementById('results-grid');
  if (!el) return;
  if (!items.length) { el.innerHTML = '<div class="empty-state">該当するアイテムがありません</div>'; return; }
  el.innerHTML = items.map(function(item) {
    var clip  = isClip(item);
    var sel   = !clip && selectedItems.some(function(s) { return s.id === item.id; });
    var bulkSel = bulkSelectedIds.indexOf(item.id) >= 0;
    var thumb = item.thumb_url || item.ogp_thumb || '';
    var project = allProjects.find(function(p) { return p.id === item.project_id; });
    var projDot = project ? '<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:' + esc(project.color) + ';margin-right:3px;vertical-align:middle"></span>' : '';
    var tagList = [item.category, item.usage].filter(Boolean);
    var displayTitle = item.file_name || item.ai_summary || (item.origin_url ? item.origin_url.substring(0, 40) + '…' : '無題');

    // サムネHTML（クリップのフォールバック含む）
    var thumbHtml;
    if (thumb) {
      thumbHtml = '<img class="result-thumb" src="' + esc(thumb) + '" alt="" loading="lazy" />';
    } else if (clip) {
      thumbHtml = buildClipFallbackThumb(item);
    } else {
      thumbHtml = '<div class="result-no-thumb">' + fileTypeEmoji(item.file_type, item.source) + '</div>';
    }

    // クリックアクション決定
    var clickAction;
    if (bulkEditMode) {
      clickAction = 'toggleBulkSelect(\'' + item.id + '\')';
    } else if (clip) {
      clickAction = 'openTagModal(\'' + item.id + '\')';
    } else {
      clickAction = 'toggleSelect(\'' + item.id + '\')';
    }

    // 選択状態クラス
    var selectedClass = '';
    if (bulkEditMode && bulkSel) selectedClass = 'bulk-selected';
    else if (!clip && sel) selectedClass = 'selected';

    return '<div class="result-card ' + selectedClass + ' ' + (clip ? 'clip-card' : '') + '" onclick="' + clickAction + '">' +
      '<div class="result-thumb-wrap">' +
        thumbHtml +
        '<div class="result-source-badge">' + esc(item.source || '自社') + '</div>' +
        (bulkEditMode
          ? '<div class="result-bulk-check">' + (bulkSel ? '✓' : '') + '</div>'
          : (!clip ? '<div class="result-check">✓</div>' : '')) +
      '</div>' +
      '<div class="result-info">' +
        '<div class="result-title">' + esc(displayTitle) + '</div>' +
        '<div class="result-tags">' +
          (project ? '<span class="result-tag">' + projDot + esc(project.name) + '</span>' : '') +
          tagList.map(function(t) { return '<span class="result-tag">' + esc(t) + '</span>'; }).join('') +
        '</div>' +
        (item.origin_url ? '<a class="result-url-link" href="' + esc(item.origin_url) + '" target="_blank" rel="noopener" onclick="event.stopPropagation()">🔗 元リンク</a>' : '') +
      '</div>' +
      '<button class="result-delete-btn" onclick="event.stopPropagation();openDeleteItem(\'' + item.id + '\')" title="削除">🗑</button>' +
    '</div>';
  }).join('');
  var rc = document.getElementById('results-count');
  if (rc) rc.textContent = items.length + ' 件';
}

// ============================================================
// クリップサムネ フォールバック
// ============================================================
function buildClipFallbackThumb(item) {
  var domain = getDomain(item.origin_url);
  var emoji  = sourceEmoji(item.source);
  var cls    = getSourceClass(item.source);
  return '<div class="result-clip-fallback ' + cls + '">' +
    '<span class="clip-fb-emoji-lg">' + emoji + '</span>' +
    '<span class="clip-fb-domain">' + esc(domain) + '</span>' +
  '</div>';
}

function getDomain(url) {
  if (!url) return '';
  try { return new URL(url).hostname.replace('www.', ''); }
  catch(e) { return url.substring(0, 20); }
}

function getSourceClass(source) {
  var map = { 'Instagram': 'src-instagram', 'Pinterest': 'src-pinterest', 'X': 'src-x', 'TikTok': 'src-tiktok', 'note': 'src-note', 'Web': 'src-web' };
  return map[source] || 'src-default';
}

// ============================================================
// フィルターチップ描画
// ============================================================
function renderFilterChips() {
  ['category','usage','area','tone'].forEach(function(axis) {
    var el = document.getElementById('filter-' + axis);
    if (!el) return;
    el.innerHTML = (tags[axis] || []).map(function(tag) {
      return '<button class="chip" data-axis="' + axis + '" data-value="' + tag + '" onclick="toggleFilter(\'' + axis + '\',\'' + tag + '\',this)">' + esc(tag) + '</button>';
    }).join('');
  });
}

function renderModalTagChips() {
  ['category','usage','area','tone'].forEach(function(axis) {
    var el = document.getElementById('modal-' + axis);
    if (!el) return;
    var isMulti = MULTI_SELECT_AXES.indexOf(axis) >= 0;
    el.innerHTML = (tags[axis] || []).map(function(tag) {
      return '<button class="chip ' + (isMulti ? 'multi' : '') + '" data-axis="' + axis + '" data-value="' + tag + '" onclick="selectModalTag(\'' + axis + '\',\'' + tag + '\',this)">' + esc(tag) + '</button>';
    }).join('');
  });
}

function renderSelectedThumbs() {
  var el = document.getElementById('selected-thumbs');
  if (!el) return;
  if (!selectedItems.length) { el.innerHTML = '<div class="empty-state small">検索タブ（アーカイブ）で写真を選択してください</div>'; return; }
  el.innerHTML = selectedItems.map(function(item) {
    var src = item.thumb_url || item.ogp_thumb || '';
    return '<div class="selected-thumb-item">' +
      (src ? '<img src="' + esc(src) + '" alt="" />' : '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:1.5rem">' + fileTypeEmoji(item.file_type, item.source) + '</div>') +
      '<button class="selected-thumb-remove" onclick="removeSelected(\'' + item.id + '\')">✕</button></div>';
  }).join('');
}

// ============================================================
// 選択（アーカイブのみ / プロンプト用）
// ============================================================
function toggleSelect(id) {
  if (bulkEditMode) { toggleBulkSelect(id); return; }
  var item = allItems.find(function(i) { return i.id === id; });
  if (!item || isClip(item)) return;
  var idx = selectedItems.findIndex(function(s) { return s.id === id; });
  if (idx >= 0) selectedItems.splice(idx, 1); else selectedItems.push(item);
  renderResultsGrid(filteredItems());
  var sc = document.getElementById('selected-count');
  if (sc) sc.textContent = selectedItems.length;
}

function removeSelected(id) {
  selectedItems = selectedItems.filter(function(i) { return i.id !== id; });
  renderSelectedThumbs();
  renderResultsGrid(filteredItems());
  var sc = document.getElementById('selected-count');
  if (sc) sc.textContent = selectedItems.length;
}

// ============================================================
// タグ編集モーダル
// ============================================================
function setupTagModal() {
  var mClose = document.getElementById('modal-close');
  if (mClose) mClose.addEventListener('click', closeTagModal);
  var mSkip = document.getElementById('modal-skip');
  if (mSkip) mSkip.addEventListener('click', closeTagModal);
  var mSave = document.getElementById('modal-save');
  if (mSave) mSave.addEventListener('click', saveTagModal);
  var mDelete = document.getElementById('modal-delete-btn');
  if (mDelete) mDelete.addEventListener('click', function() {
    if (currentItemId) openDeleteItem(currentItemId);
  });
}

function openTagModal(id) {
  var item = allItems.find(function(i) { return i.id === id; });
  if (!item) return;
  currentItemId = id;
  var thumb = document.getElementById('modal-thumb');
  var src = item.thumb_url || item.ogp_thumb || '';
  if (thumb) { thumb.src = src; thumb.style.display = src ? 'block' : 'none'; }
  var titleEl = document.getElementById('modal-item-title');
  if (titleEl) titleEl.textContent = item.file_name || item.ai_summary || '無題';
  var urlEl = document.getElementById('modal-origin-url');
  if (urlEl) { if (item.origin_url) { urlEl.href = item.origin_url; urlEl.style.display = 'inline-block'; } else { urlEl.style.display = 'none'; } }

  document.querySelectorAll('#tag-modal .tag-chips .chip').forEach(function(b) { b.classList.remove('active'); });
  ['category','usage','area','tone'].forEach(function(axis) {
    if (!item[axis]) return;
    var el = document.getElementById('modal-' + axis);
    if (!el) return;
    item[axis].split(',').forEach(function(v) { var b = el.querySelector('[data-value="' + v.trim() + '"]'); if (b) b.classList.add('active'); });
  });
  renderProjectChipsInModals();
  if (item.project_id) {
    setTimeout(function() {
      var el = document.getElementById('modal-project');
      if (el) { var b = el.querySelector('[data-value="' + item.project_id + '"]'); if (b) b.classList.add('active'); }
    }, 50);
  }
  var memo = document.getElementById('modal-memo');
  if (memo) memo.value = item.memo || '';
  document.getElementById('tag-modal').style.display = 'flex';
}

function closeTagModal() { document.getElementById('tag-modal').style.display = 'none'; currentItemId = null; }

function selectModalTag(axis, value, btn) {
  if (MULTI_SELECT_AXES.indexOf(axis) >= 0) {
    btn.classList.toggle('active');
  } else {
    var chips = btn.closest('.tag-chips');
    if (chips) chips.querySelectorAll('.chip').forEach(function(b) { b.classList.remove('active'); });
    btn.classList.add('active');
  }
}

function saveTagModal() {
  if (!currentItemId) return;
  var required = ['category','usage'];
  for (var i = 0; i < required.length; i++) {
    var el = document.getElementById('modal-' + required[i]);
    if (!el || !el.querySelector('.chip.active')) { showToast(axisLabel(required[i]) + ' を選択してください'); return; }
  }
  var data = { action: 'updateTags', id: currentItemId };
  ['category','usage','area','tone'].forEach(function(axis) {
    var el = document.getElementById('modal-' + axis);
    if (!el) return;
    var selected = Array.from(el.querySelectorAll('.chip.active')).map(function(b) { return b.getAttribute('data-value'); });
    if (selected.length) data[axis] = selected.join(',');
  });
  var projEl = document.getElementById('modal-project');
  if (projEl) { var ps = projEl.querySelector('.chip.active'); if (ps) data.project_id = ps.getAttribute('data-value'); }
  var memo = document.getElementById('modal-memo');
  if (memo) data.memo = memo.value;
  if (!gasUrl) { showToast('GASを接続してください'); return; }
  apiPost(data).then(function(result) {
    if (result && result.success) { showToast('保存しました ✓'); closeTagModal(); fetchItems(activeFilters); }
    else showToast('保存に失敗しました');
  });
}

// ============================================================
// プロンプト生成（アーカイブのみ）
// ============================================================
function setupPrompt() {
  var genBtn = document.getElementById('generate-btn');
  if (genBtn) genBtn.addEventListener('click', doGeneratePrompt);
  var copyBtn = document.getElementById('copy-prompt-btn');
  if (copyBtn) copyBtn.addEventListener('click', function() {
    navigator.clipboard.writeText(document.getElementById('prompt-output-text').textContent).then(function() { showToast('コピーしました ✓'); });
  });
  var regenBtn = document.getElementById('regenerate-btn');
  if (regenBtn) regenBtn.addEventListener('click', doGeneratePrompt);
  var saveBtn = document.getElementById('save-prompt-btn');
  if (saveBtn) saveBtn.addEventListener('click', function() {
    var prompt = document.getElementById('prompt-output-text').textContent;
    selectedItems.forEach(function(item) { apiPost({ action: 'updateTags', id: item.id, prompt: prompt }); });
    showToast('プロンプトを保存しました');
  });
  var clearBtn = document.getElementById('clear-selection');
  if (clearBtn) clearBtn.addEventListener('click', function() {
    selectedItems = []; renderSelectedThumbs(); renderResultsGrid(filteredItems());
    var sc = document.getElementById('selected-count'); if (sc) sc.textContent = 0;
  });
  document.querySelectorAll('[data-option]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var option = btn.getAttribute('data-option');
      document.querySelectorAll('[data-option="' + option + '"]').forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
      promptOptions[option] = btn.getAttribute('data-value');
    });
  });
}

async function doGeneratePrompt() {
  var genBtn = document.getElementById('generate-btn');
  var outText = document.getElementById('prompt-output-text');
  var outArea = document.getElementById('prompt-output');
  if (genBtn) { genBtn.disabled = true; genBtn.textContent = '解析中...'; }

  var item = selectedItems[0] || null;
  var imageUrl = item ? (item.thumb_url || item.ogp_thumb || '') : '';
  var refUrl = (document.getElementById('ref-image-url') || {}).value || '';
  var prompt = '';

  if (imageUrl && apiKey) {
    try { prompt = await generatePromptFromImage(imageUrl, item, refUrl); }
    catch(e) { prompt = generatePromptFromTags(item, refUrl); }
  } else if (imageUrl) {
    prompt = generatePromptFromTags(item, refUrl);
    showToast('APIキー未設定のためタグベースで生成しました');
  } else if (item) {
    prompt = generatePromptFromTags(item, refUrl);
  } else {
    prompt = '検索タブ（アーカイブ）で写真を選択してください';
  }

  if (outText) outText.textContent = prompt;
  if (outArea) outArea.style.display = 'block';
  if (genBtn) { genBtn.disabled = false; genBtn.innerHTML = '<span class="generate-icon">✦</span> プロンプトを生成'; }
}

async function generatePromptFromImage(imageUrl, item, refUrl) {
  var sys = 'イベント装飾・演出のプロフェッショナルとして画像を分析し、nano banana Pro用プロンプトを英語で生成してください。\n[主役]+[スタイル]+[環境]+[照明/色調]+[構図]\n末尾に必ず: Photorealistic, Highly detailed texture, Soft shadows, Depth of field, Shot on 35mm lens, f/1.8.\nプロンプトテキストのみ返してください。';
  var response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
    body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 1000, system: sys, messages: [{ role: 'user', content: [
      { type: 'image', source: { type: 'url', url: imageUrl } },
      { type: 'text', text: 'この装飾・演出画像を分析してください。' + (refUrl ? ' 参考スタイル: ' + refUrl : '') }
    ]}]})
  });
  var data = await response.json();
  return data.content && data.content[0] ? data.content[0].text.trim() : '';
}

var CATEGORY_EN = {'すぐ見て':'featured decoration','実績資料':'portfolio decoration','案件資料':'project decoration','宣伝PR':'promotional decoration','イベント':'event decoration','雑学':'decorative reference','AI情報':'AI-inspired decoration','勉強用':'educational reference','BIZ資料':'business reference','注意喚起':'alert decoration','なんでもBOX':'miscellaneous decoration'};
var USAGE_EN    = {'AI界':'AI industry event','BIZ界':'business event','宣伝界':'promotional event','雑学界':'general event','装飾(演)':'decorative performance','照明(演)':'lighting performance','映像(演)':'video projection performance','機材工具':'equipment reference','部材資料':'materials reference','技法工法':'technique reference'};
var AREA_EN     = {'屋内':'indoor venue','屋外':'outdoor space','小型':'small-scale installation','大型':'large-scale installation','ゲート':'entrance gate','ステージ':'stage area','キッズエリア':'kids area','導線':'guest flow path','展示':'exhibition space','フォトスポ':'photo spot','看板':'signage area','エントランス':'entrance hall','その他':'event space'};
var TONE_EN     = {'エレガント':'elegant and refined','ポップ':'vibrant and playful','ラグジュアリー':'luxurious and high-end','クール':'cool and contemporary','キッズ':'fun and kid-friendly','シンプル':'clean and minimal','モノトン':'monochromatic','カラフル':'colorful and vivid','ネイチャー':'natural and organic','フラワー':'floral and botanical','ビビット':'vivid and saturated','派手':'bold and extravagant','地味':'understated and subtle'};
var LIGHT_EN    = {'golden-hour':'golden hour warm sunlight','neon-reflection':'neon reflections on glossy surfaces','soft-ambient':'soft ambient diffused lighting'};
var ANGLE_EN    = {'wide-angle':'Shot with ultra wide-angle lens','close-up':'Close-up detail shot','top-down':'Top-down aerial view'};

function generatePromptFromTags(item, refUrl) {
  if (!item) return '';
  var catEn   = CATEGORY_EN[item.category] || item.category || 'event decoration';
  var usageEn = USAGE_EN[item.usage]       || item.usage    || 'event';
  var areas   = item.area ? item.area.split(',').map(function(a) { return AREA_EN[a.trim()] || a.trim(); }) : [];
  var tones   = item.tone ? item.tone.split(',').map(function(t) { return TONE_EN[t.trim()] || t.trim(); }) : [];
  var lightEn = LIGHT_EN[promptOptions.lighting] || '';
  var angleEn = ANGLE_EN[promptOptions.angle]    || '';
  var p = 'A ' + catEn + (areas[0] ? ' ' + areas[0] : '') + ' for a ' + usageEn + ' setting';
  if (tones.length) p += ', ' + tones.join(' and ') + ' atmosphere';
  p += '.\n';
  if (lightEn) p += lightEn + '.\n';
  if (angleEn) p += angleEn + '.\n';
  p += 'Photorealistic, Highly detailed texture, Soft shadows, Depth of field, Shot on 35mm lens, f/1.8.';
  if (refUrl) p = 'Based on this reference image style, create a similar composition.\n\n' + p;
  return p;
}

// ============================================================
// ビュー切替
// ============================================================
function setupViewToggle() {
  document.querySelectorAll('.view-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      document.querySelectorAll('.view-btn').forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
      var grid = document.getElementById('results-grid');
      if (grid) { if (btn.getAttribute('data-view') === 'list') grid.classList.add('list-view'); else grid.classList.remove('list-view'); }
    });
  });
}

// ============================================================
// ユーティリティ
// ============================================================
function showToast(msg) {
  var el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(function() { el.classList.remove('show'); }, 2500);
}
function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function formatDate(iso) {
  if (!iso) return '';
  var d = new Date(iso);
  return d.getFullYear() + '/' + pad(d.getMonth()+1) + '/' + pad(d.getDate());
}
function pad(n) { return String(n).padStart(2,'0'); }
function sourceEmoji(source) {
  var map = {'Instagram':'📸','Pinterest':'📌','X':'𝕏','TikTok':'🎵','note':'📝','Web':'🌐','自社撮影':'📷','URL':'🔗'};
  return map[source] || '📁';
}
function fileTypeEmoji(fileType, source) {
  if (fileType === 'image') return '🖼';
  if (fileType === 'video') return '🎬';
  if (fileType === 'file')  return '📄';
  if (fileType === 'link')  return '📎';
  return sourceEmoji(source);
}
function axisLabel(axis) {
  var map = {category:'カテゴリ',usage:'用途',area:'エリア＆サイズ感',tone:'トンマナ',project:'プロジェクト'};
  return map[axis] || axis;
}

// ============================================================
// PWA: Share Target受信 + インストール促進
// ============================================================
function setupPWA() {
  // Service Workerからの共有URL受信
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', function(event) {
      if (event.data && event.data.type === 'SHARE_TARGET') {
        handleSharedContent(event.data);
      }
    });
  }

  // ページ直接遷移時のURLパラメータ受信（SW未経由）
  var params = new URLSearchParams(window.location.search);
  var sharedUrl = params.get('share') || params.get('url') || '';
  if (sharedUrl) {
    setTimeout(function() { handleSharedContent({ url: sharedUrl, title: params.get('title') || '', text: params.get('text') || '' }); }, 1000);
    // URLパラメータをクリア（履歴に残さない）
    window.history.replaceState({}, '', '/shiftra/');
  }

  // iOSホーム追加バナー（初回のみ）
  var isIOS     = /iphone|ipad|ipod/i.test(navigator.userAgent);
  var isInApp   = window.navigator.standalone;
  var dismissed = localStorage.getItem('siftra_ios_banner_dismissed');
  if (isIOS && !isInApp && !dismissed) {
    setTimeout(showIOSInstallBanner, 3000);
  }

  // Android/Chrome: beforeinstallpromptを保持
  window.addEventListener('beforeinstallprompt', function(e) {
    e.preventDefault();
    window._installPrompt = e;
  });
}

// 受信したURLを受信ボックスに流し込む
function handleSharedContent(data) {
  var url   = data.url   || '';
  var title = data.title || '';

  if (!url && data.text) url = extractUrlFromText(data.text);
  if (!url) return;

  // 受信タブに切替
  document.querySelectorAll('.nav-item').forEach(function(b) { b.classList.remove('active'); });
  document.querySelectorAll('.tab-content').forEach(function(s) { s.classList.remove('active'); });
  var inboxNav = document.querySelector('[data-tab="inbox"]');
  var inboxTab = document.getElementById('tab-inbox');
  if (inboxNav) inboxNav.classList.add('active');
  if (inboxTab) inboxTab.classList.add('active');

  // URLを入力欄にセット → 自動実行
  var input = document.getElementById('share-url-input');
  if (input) {
    input.value = url;
    showToast('📎 共有URLを受信しました');
    setTimeout(function() { doShareUrl(); }, 600);
  }
}

function extractUrlFromText(text) {
  if (!text) return '';
  var m = text.match(/https?:\/\/[^\s]+/);
  return m ? m[0] : '';
}

// iOSインストールバナー
function showIOSInstallBanner() {
  if (document.getElementById('ios-install-banner')) return;
  var banner = document.createElement('div');
  banner.id = 'ios-install-banner';
  banner.className = 'ios-install-banner';
  banner.innerHTML =
    '<div class="ios-banner-inner">' +
      '<span class="ios-banner-icon">Ⓢ</span>' +
      '<div class="ios-banner-text">' +
        '<strong>ホーム画面に追加</strong>' +
        '<span>共有ボタン → 「ホーム画面に追加」でアプリとして使えます</span>' +
      '</div>' +
      '<button class="ios-banner-close" onclick="dismissIOSBanner()">✕</button>' +
    '</div>' +
    '<div class="ios-banner-arrow">▼</div>';
  document.body.appendChild(banner);
}

function dismissIOSBanner() {
  var b = document.getElementById('ios-install-banner');
  if (b) { b.style.opacity = '0'; setTimeout(function() { b.remove(); }, 300); }
  localStorage.setItem('siftra_ios_banner_dismissed', '1');
}
