// ============================================================
// Siftra — app.js（安定版）
// ============================================================

var gasUrl   = localStorage.getItem('siftra_gas_url') || '';
var username = localStorage.getItem('siftra_username') || 'ユーザー';
var allItems = [];
var selectedItems = [];
var activeFilters = {};
var selectedSource = 'Instagram';
var promptOptions = { angle: '', lighting: '' };
var currentItemId = null;

var tags = {
  category:  ['バルーン', 'ネオン', 'フラワー', 'シンプル', 'オプ', 'ステージ', 'ゲート'],
  usage:     ['企業式典', '結婚式', '展示会', '屋外イベント', '店舗装飾', '撮影用'],
  tone:      ['エレガント', 'ポップ', 'ナチュラル', 'ラグジュアリー', 'クール', 'キッズ'],
  color:     ['ホワイト', 'ゴールド', 'パステル', 'ビビッド', 'モノクロ', 'グリーン', 'ピンク', 'ブラック'],
  area:      ['エントランス', 'センター', '壁面', '天井', '屋外', 'テーブル', 'ステージ前'],
  cost:      ['〜5万', '5〜20万', '20〜50万', '50万〜'],
  structure: ['大型構造', '吊り下げ', '置き型', '壁付け', '水物', '照明連動', 'アーチ型'],
};

window.addEventListener('DOMContentLoaded', function() {
  // ローディングを必ず消す
  setTimeout(function() {
    var ls = document.getElementById('loading-screen');
    if (ls) ls.classList.add('hidden');
  }, 1500);

  renderFilterChips();
  renderModalTagChips();
  renderUntaggedList([]);
  renderResultsGrid([]);

  var hStats = document.getElementById('header-stats');
  if (hStats) hStats.textContent = gasUrl ? 'connecting...' : 'GAS未接続';

  if (gasUrl) fetchItems({});

  // ナビ
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

  // 設定
  var sBtn = document.getElementById('settings-btn');
  if (sBtn) sBtn.addEventListener('click', function() {
    document.getElementById('settings-gas-url').value = gasUrl;
    document.getElementById('settings-username').value = username;
    document.getElementById('settings-modal').style.display = 'flex';
  });
  var sClose = document.getElementById('settings-close');
  if (sClose) sClose.addEventListener('click', function() {
    document.getElementById('settings-modal').style.display = 'none';
  });
  var sSave = document.getElementById('settings-save');
  if (sSave) sSave.addEventListener('click', function() {
    gasUrl   = document.getElementById('settings-gas-url').value.trim();
    username = document.getElementById('settings-username').value.trim();
    localStorage.setItem('siftra_gas_url', gasUrl);
    localStorage.setItem('siftra_username', username);
    document.getElementById('settings-modal').style.display = 'none';
    showToast('設定を保存しました ✓');
    if (gasUrl) fetchItems({});
  });

  // ソースチップ
  document.querySelectorAll('.source-chips .chip').forEach(function(btn) {
    btn.addEventListener('click', function() {
      document.querySelectorAll('.source-chips .chip').forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
      selectedSource = btn.getAttribute('data-source');
    });
  });

  // URLシェア
  var shareBtn = document.getElementById('share-url-btn');
  if (shareBtn) shareBtn.addEventListener('click', doShareUrl);
  var shareInput = document.getElementById('share-url-input');
  if (shareInput) shareInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') doShareUrl();
  });

  // ファイルアップロード
  var fileInput = document.getElementById('file-input');
  if (fileInput) fileInput.addEventListener('change', function(e) {
    var files = Array.from(e.target.files);
    uploadFiles(files).then(function() { e.target.value = ''; fetchItems({}); });
  });
  var dropZone = document.getElementById('upload-drop-zone');
  if (dropZone) {
    dropZone.addEventListener('dragover', function(e) { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', function() { dropZone.classList.remove('drag-over'); });
    dropZone.addEventListener('drop', function(e) {
      e.preventDefault(); dropZone.classList.remove('drag-over');
      var files = Array.from(e.dataTransfer.files).filter(function(f) { return f.type.startsWith('image/'); });
      uploadFiles(files).then(function() { fetchItems({}); });
    });
  }

  // フィルター
  var applyBtn = document.getElementById('filter-apply');
  if (applyBtn) applyBtn.addEventListener('click', function() { fetchItems(activeFilters); });
  var resetBtn = document.getElementById('filter-reset');
  if (resetBtn) resetBtn.addEventListener('click', function() {
    activeFilters = {};
    document.querySelectorAll('.filter-chips .chip').forEach(function(b) { b.classList.remove('active'); });
    fetchItems({});
  });

  // ビュー切替
  document.querySelectorAll('.view-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      document.querySelectorAll('.view-btn').forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
      var grid = document.getElementById('results-grid');
      if (grid) {
        if (btn.getAttribute('data-view') === 'list') grid.classList.add('list-view');
        else grid.classList.remove('list-view');
      }
    });
  });

  // タグモーダル
  var mClose = document.getElementById('modal-close');
  if (mClose) mClose.addEventListener('click', closeTagModal);
  var mSkip = document.getElementById('modal-skip');
  if (mSkip) mSkip.addEventListener('click', closeTagModal);
  var mSave = document.getElementById('modal-save');
  if (mSave) mSave.addEventListener('click', saveTagModal);

  // プロンプト
  var genBtn = document.getElementById('generate-btn');
  if (genBtn) genBtn.addEventListener('click', doGeneratePrompt);
  var copyBtn = document.getElementById('copy-prompt-btn');
  if (copyBtn) copyBtn.addEventListener('click', function() {
    var text = document.getElementById('prompt-output-text').textContent;
    navigator.clipboard.writeText(text).then(function() { showToast('コピーしました ✓'); });
  });
  var regenBtn = document.getElementById('regenerate-btn');
  if (regenBtn) regenBtn.addEventListener('click', doGeneratePrompt);
  var savePromptBtn = document.getElementById('save-prompt-btn');
  if (savePromptBtn) savePromptBtn.addEventListener('click', function() {
    var prompt = document.getElementById('prompt-output-text').textContent;
    selectedItems.forEach(function(item) { apiPost({ action: 'updateTags', id: item.id, prompt: prompt }); });
    showToast('プロンプトを保存しました');
  });
  var clearBtn = document.getElementById('clear-selection');
  if (clearBtn) clearBtn.addEventListener('click', function() {
    selectedItems = [];
    renderSelectedThumbs();
    renderResultsGrid(allItems);
    document.getElementById('selected-count').textContent = 0;
  });
  document.querySelectorAll('[data-option]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var option = btn.getAttribute('data-option');
      document.querySelectorAll('[data-option="' + option + '"]').forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
      promptOptions[option] = btn.getAttribute('data-value');
    });
  });
});

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
// データ
// ============================================================
function fetchItems(filters) {
  var params = Object.assign({ action: 'getItems' }, filters);
  apiGet(params).then(function(data) {
    if (data && !data.error) {
      allItems = data.items || [];
      var untagged = allItems.filter(function(i) { return !i.category; });
      renderUntaggedList(untagged);
      renderResultsGrid(allItems);
      var total = data.total || allItems.length;
      var hStats = document.getElementById('header-stats');
      if (hStats) hStats.textContent = 'total ' + total + ' items';
      var ic = document.getElementById('inbox-count');
      if (ic) ic.textContent = untagged.length;
      var rc = document.getElementById('results-count');
      if (rc) rc.textContent = total + ' 件';
    }
  });
}

function doShareUrl() {
  var url = document.getElementById('share-url-input').value.trim();
  if (!url) return;
  if (!gasUrl) { showToast('設定からGAS URLを入力してください'); return; }
  showToast('受信中...');
  apiPost({ action: 'saveItem', url: url, source: selectedSource, registered_by: username })
    .then(function(result) {
      if (result && result.success) {
        document.getElementById('share-url-input').value = '';
        showToast('受信しました ✓');
        fetchItems({});
      } else { showToast('受信に失敗しました'); }
    });
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
      showToast('アップロード中: ' + file.name);
      return apiPost({ action: 'saveImageFile', fileName: file.name, mimeType: file.type, base64: b64.split(',')[1], category: '', registered_by: username });
    }).then(function(result) {
      showToast(result && result.success ? '完了: ' + file.name : '失敗: ' + file.name);
    });
  }));
}

// ============================================================
// RENDER
// ============================================================
function renderUntaggedList(items) {
  var el = document.getElementById('untagged-list');
  if (!el) return;
  if (!items.length) { el.innerHTML = '<div class="empty-state">未タグのアイテムはありません ✓</div>'; return; }
  el.innerHTML = items.map(function(item) {
    var src = item.thumb_url || item.ogp_thumb || '';
    var thumbHtml = src
      ? '<img class="untagged-thumb" src="' + esc(src) + '" alt="" loading="lazy" />'
      : '<div class="untagged-thumb url-thumb">' + sourceEmoji(item.source) + '</div>';
    return '<div class="untagged-item" onclick="openTagModal(\'' + item.id + '\')">' +
      thumbHtml +
      '<div class="untagged-info"><div class="untagged-title">' + esc(item.file_name || '無題') + '</div><div class="untagged-meta">' + formatDate(item.created_at) + '</div></div>' +
      '<div class="untagged-source-badge">' + esc(item.source || '自社') + '</div></div>';
  }).join('');
}

function renderResultsGrid(items) {
  var el = document.getElementById('results-grid');
  if (!el) return;
  if (!items.length) { el.innerHTML = '<div class="empty-state">該当するアイテムがありません</div>'; return; }
  el.innerHTML = items.map(function(item) {
    var sel = selectedItems.some(function(s) { return s.id === item.id; });
    var thumb = item.thumb_url || item.ogp_thumb || '';
    return '<div class="result-card ' + (sel ? 'selected' : '') + '" onclick="toggleSelect(\'' + item.id + '\')">' +
      '<div class="result-thumb-wrap">' +
        (thumb ? '<img class="result-thumb" src="' + esc(thumb) + '" alt="" loading="lazy" />' : '<div class="result-no-thumb">' + sourceEmoji(item.source) + '</div>') +
        '<div class="result-source-badge">' + esc(item.source || '自社') + '</div>' +
        '<div class="result-check">✓</div>' +
      '</div>' +
      '<div class="result-info"><div class="result-title">' + esc(item.file_name || '無題') + '</div>' +
        '<div class="result-tags">' + [item.category, item.usage, item.tone].filter(Boolean).map(function(t) { return '<span class="result-tag">' + esc(t) + '</span>'; }).join('') + '</div>' +
      '</div></div>';
  }).join('');
}

function renderFilterChips() {
  ['category','usage','tone','color'].forEach(function(axis) {
    var el = document.getElementById('filter-' + axis);
    if (!el) return;
    el.innerHTML = (tags[axis] || []).map(function(tag) {
      return '<button class="chip" data-axis="' + axis + '" data-value="' + tag + '" onclick="toggleFilter(\'' + axis + '\',\'' + tag + '\',this)">' + esc(tag) + '</button>';
    }).join('');
  });
}

function renderModalTagChips() {
  ['category','usage','tone','color','area','cost','structure'].forEach(function(axis) {
    var el = document.getElementById('modal-' + axis);
    if (!el) return;
    el.innerHTML = (tags[axis] || []).map(function(tag) {
      return '<button class="chip" data-axis="' + axis + '" data-value="' + tag + '" onclick="selectModalTag(\'' + axis + '\',\'' + tag + '\',this)">' + esc(tag) + '</button>';
    }).join('');
  });
}

function renderSelectedThumbs() {
  var el = document.getElementById('selected-thumbs');
  if (!el) return;
  if (!selectedItems.length) { el.innerHTML = '<div class="empty-state small">検索タブで写真を選択してください</div>'; return; }
  el.innerHTML = selectedItems.map(function(item) {
    var src = item.thumb_url || item.ogp_thumb || '';
    return '<div class="selected-thumb-item">' +
      (src ? '<img src="' + esc(src) + '" alt="" />' : '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:1.5rem">' + sourceEmoji(item.source) + '</div>') +
      '<button class="selected-thumb-remove" onclick="removeSelected(\'' + item.id + '\')">✕</button></div>';
  }).join('');
}

// ============================================================
// 選択
// ============================================================
function toggleSelect(id) {
  var item = allItems.find(function(i) { return i.id === id; });
  if (!item) return;
  var idx = selectedItems.findIndex(function(s) { return s.id === id; });
  if (idx >= 0) selectedItems.splice(idx, 1); else selectedItems.push(item);
  renderResultsGrid(allItems);
  var sc = document.getElementById('selected-count');
  if (sc) sc.textContent = selectedItems.length;
}

function removeSelected(id) {
  selectedItems = selectedItems.filter(function(i) { return i.id !== id; });
  renderSelectedThumbs();
  renderResultsGrid(allItems);
  var sc = document.getElementById('selected-count');
  if (sc) sc.textContent = selectedItems.length;
}

function toggleFilter(axis, value, btn) {
  if (activeFilters[axis] === value) { delete activeFilters[axis]; btn.classList.remove('active'); }
  else {
    document.querySelectorAll('[data-axis="' + axis + '"]').forEach(function(b) { b.classList.remove('active'); });
    activeFilters[axis] = value; btn.classList.add('active');
  }
}

// ============================================================
// タグモーダル
// ============================================================
function openTagModal(id) {
  var item = allItems.find(function(i) { return i.id === id; });
  if (!item) return;
  currentItemId = id;
  var thumb = document.getElementById('modal-thumb');
  var src = item.thumb_url || item.ogp_thumb || '';
  if (thumb) { thumb.src = src; thumb.style.display = src ? 'block' : 'none'; }
  var titleEl = document.getElementById('modal-item-title');
  if (titleEl) titleEl.textContent = item.file_name || '無題';
  document.querySelectorAll('.tag-chips .chip').forEach(function(b) { b.classList.remove('active'); });
  ['category','usage','tone','color','area','cost','structure'].forEach(function(axis) {
    if (item[axis]) {
      var el = document.getElementById('modal-' + axis);
      if (el) { var b = el.querySelector('[data-value="' + item[axis] + '"]'); if (b) b.classList.add('active'); }
    }
  });
  var memo = document.getElementById('modal-memo');
  if (memo) memo.value = item.memo || '';
  var modal = document.getElementById('tag-modal');
  if (modal) modal.style.display = 'flex';
}

function closeTagModal() {
  var modal = document.getElementById('tag-modal');
  if (modal) modal.style.display = 'none';
  currentItemId = null;
}

function selectModalTag(axis, value, btn) {
  var parent = document.getElementById('modal-' + axis);
  if (parent) parent.querySelectorAll('.chip').forEach(function(b) { b.classList.remove('active'); });
  btn.classList.add('active');
}

function saveTagModal() {
  if (!currentItemId) return;
  var required = ['category','usage','tone'];
  for (var i = 0; i < required.length; i++) {
    var el = document.getElementById('modal-' + required[i]);
    if (!el || !el.querySelector('.chip.active')) { showToast(axisLabel(required[i]) + ' を選択してください'); return; }
  }
  var data = { action: 'updateTags', id: currentItemId };
  ['category','usage','tone','color','area','cost','structure'].forEach(function(axis) {
    var el = document.getElementById('modal-' + axis);
    var sel = el && el.querySelector('.chip.active');
    if (sel) data[axis] = sel.getAttribute('data-value');
  });
  var memo = document.getElementById('modal-memo');
  if (memo) data.memo = memo.value;
  if (!gasUrl) { showToast('設定からGAS URLを入力してください'); return; }
  apiPost(data).then(function(result) {
    if (result && result.success) { showToast('保存しました ✓'); closeTagModal(); fetchItems(activeFilters); }
    else showToast('保存に失敗しました');
  });
}

// ============================================================
// プロンプト生成
// ============================================================
var CATEGORY_EN = {'バルーン':'balloon arch installation','ネオン':'neon sign installation','フラワー':'floral decoration','シンプル':'minimal decoration','オプ':'projection mapping installation','ステージ':'stage decoration set','ゲート':'ceremonial entrance gate'};
var USAGE_EN    = {'企業式典':'corporate ceremony','結婚式':'wedding ceremony','展示会':'exhibition event','屋外イベント':'outdoor event','店舗装飾':'retail store decoration','撮影用':'photo shoot set'};
var TONE_EN     = {'エレガント':'elegant and refined','ポップ':'vibrant and playful','ナチュラル':'natural and organic','ラグジュアリー':'luxurious and high-end','クール':'cool and contemporary','キッズ':'fun and kid-friendly'};
var AREA_EN     = {'エントランス':'at the entrance of the venue','センター':'at the center of the hall','壁面':'mounted on the wall','天井':'suspended from the ceiling','屋外':'in an outdoor space','テーブル':'on the table centerpiece','ステージ前':'in front of the stage'};
var STRUCT_EN   = {'大型構造':'large-scale structure','吊り下げ':'suspended hanging installation','置き型':'freestanding placement','壁付け':'wall-mounted','水物':'water feature installation','照明連動':'integrated with lighting','アーチ型':'archway structure'};
var COLOR_EN    = {'ホワイト':'white','ゴールド':'gold','パステル':'pastel','ビビッド':'vivid saturated','モノクロ':'monochrome','グリーン':'green','ピンク':'pink','ブラック':'black'};
var LIGHT_EN    = {'golden-hour':'golden hour warm sunlight','neon-reflection':'neon reflections on glossy surfaces','soft-ambient':'soft ambient diffused lighting'};
var ANGLE_EN    = {'wide-angle':'Shot with ultra wide-angle lens','close-up':'Close-up detail shot','top-down':'Top-down aerial view'};

function doGeneratePrompt() {
  var item = selectedItems[0] || {};
  var catEn   = CATEGORY_EN[item.category]  || item.category  || 'decorative installation';
  var usageEn = USAGE_EN[item.usage]        || item.usage      || 'event';
  var toneEn  = TONE_EN[item.tone]          || item.tone       || 'elegant';
  var areaEn  = AREA_EN[item.area]          || '';
  var colorEn = COLOR_EN[item.color]        || item.color      || '';
  var structEn= STRUCT_EN[item.structure]   || '';
  var lightEn = LIGHT_EN[promptOptions.lighting] || '';
  var angleEn = ANGLE_EN[promptOptions.angle]    || '';
  var refEl   = document.getElementById('ref-image-url');
  var refUrl  = refEl ? refEl.value : '';

  var p = 'A ' + (structEn ? structEn + ' ' : '') + catEn;
  if (areaEn) p += ', ' + areaEn;
  p += '.\n' + toneEn.charAt(0).toUpperCase() + toneEn.slice(1) + ' decoration for a ' + usageEn + ' setting';
  if (colorEn) p += ', featuring ' + colorEn + ' color palette';
  p += '.\n';
  if (lightEn) p += lightEn + '.\n';
  if (angleEn) p += angleEn + '.\n';
  p += 'Photorealistic, Highly detailed texture, Soft shadows, Depth of field, Shot on 35mm lens, f/1.8.';
  if (refUrl) p = 'Based on this reference image style, create a similar composition.\n\n' + p;

  var outText = document.getElementById('prompt-output-text');
  var outArea = document.getElementById('prompt-output');
  if (outText) outText.textContent = p;
  if (outArea) outArea.style.display = 'block';
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
  var map = {'Instagram':'📸','Pinterest':'📌','X':'𝕏','TikTok':'🎵','Web':'🌐','自社撮影':'📷','URL':'🔗'};
  return map[source] || '📁';
}
function axisLabel(axis) {
  var map = {category:'カテゴリ',usage:'用途',tone:'トーン',color:'カラー',area:'エリア',cost:'コスト感',structure:'施工特性'};
  return map[axis] || axis;
}
