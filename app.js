// ============================================================
// Siftra — app.js v2
// ============================================================

var gasUrl   = localStorage.getItem('siftra_gas_url') || '';
var username = localStorage.getItem('siftra_username') || 'ユーザー';
var apiKey   = localStorage.getItem('siftra_api_key') || '';
var allItems = [];
var selectedItems = [];
var activeFilters = {};
var selectedSource = 'Instagram';
var promptOptions = { angle: '', lighting: '' };
var currentItemId = null;

// ============================================================
// タグマスタ（差し替え版）
// ============================================================
var tags = {
  category:  ['すぐ見て', '実績資料', '案件資料', '宣伝PR', 'イベント', '雑学', 'AI情報', '勉強用', 'BIZ資料', '注意喚起', 'なんでもBOX'],
  usage:     ['AI界', 'BIZ界', '宣伝界', '雑学界', '装飾(演)', '照明(演)', '映像(演)', '機材工具', '部材資料', '技法工法'],
  area:      ['屋内', '屋外', '小型', '大型', 'ゲート', 'ステージ', 'キッズエリア', '導線', '展示', 'フォトスポ', '看板', 'エントランス', 'その他'],
  tone:      ['エレガント', 'ポップ', 'ラグジュアリー', 'クール', 'キッズ', 'シンプル', 'モノトン', 'カラフル', 'ネイチャー', 'フラワー', 'ビビット', '派手', '地味'],
  // 以下は旧来の軸（内部処理用・UI非表示）
  color:     ['ホワイト', 'ゴールド', 'パステル', 'ビビッド', 'モノクロ', 'グリーン', 'ピンク', 'ブラック'],
  cost:      ['〜5万', '5〜20万', '20〜50万', '50万〜'],
  structure: ['大型構造', '吊り下げ', '置き型', '壁付け', '水物', '照明連動', 'アーチ型'],
};

// 複数選択可能な軸
var MULTI_SELECT_AXES = ['area', 'tone'];

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
  renderUntaggedList([]);
  renderResultsGrid([]);

  var hStats = document.getElementById('header-stats');
  if (hStats) hStats.textContent = gasUrl ? 'connecting...' : 'GAS未接続';

  if (gasUrl) fetchItems({});

  setupNav();
  setupSettings();
  setupShareInput();
  setupFileUpload();
  setupFilters();
  setupTagModal();
  setupPrompt();
  setupViewToggle();
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
  var sBtn = document.getElementById('settings-btn');
  if (sBtn) sBtn.addEventListener('click', function() {
    document.getElementById('settings-gas-url').value = gasUrl;
    document.getElementById('settings-username').value = username;
    document.getElementById('settings-api-key').value = apiKey;
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
    apiKey   = document.getElementById('settings-api-key').value.trim();
    localStorage.setItem('siftra_gas_url', gasUrl);
    localStorage.setItem('siftra_username', username);
    localStorage.setItem('siftra_api_key', apiKey);
    document.getElementById('settings-modal').style.display = 'none';
    showToast('設定を保存しました ✓');
    if (gasUrl) fetchItems({});
  });
}

// ============================================================
// URLシェア
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
  if (shareInput) shareInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') doShareUrl();
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

// ============================================================
// ファイルアップロード
// ============================================================
function setupFileUpload() {
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
// フィルター
// ============================================================
function setupFilters() {
  var applyBtn = document.getElementById('filter-apply');
  if (applyBtn) applyBtn.addEventListener('click', function() { fetchItems(activeFilters); });
  var resetBtn = document.getElementById('filter-reset');
  if (resetBtn) resetBtn.addEventListener('click', function() {
    activeFilters = {};
    document.querySelectorAll('.filter-chips .chip').forEach(function(b) { b.classList.remove('active'); });
    fetchItems({});
  });
}

function toggleFilter(axis, value, btn) {
  if (activeFilters[axis] === value) { delete activeFilters[axis]; btn.classList.remove('active'); }
  else {
    document.querySelectorAll('[data-axis="' + axis + '"]').forEach(function(b) { b.classList.remove('active'); });
    activeFilters[axis] = value; btn.classList.add('active');
  }
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
      if (grid) {
        if (btn.getAttribute('data-view') === 'list') grid.classList.add('list-view');
        else grid.classList.remove('list-view');
      }
    });
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

// ============================================================
// RENDER: 未タグ一覧
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

// ============================================================
// RENDER: 検索結果
// ============================================================
function renderResultsGrid(items) {
  var el = document.getElementById('results-grid');
  if (!el) return;
  if (!items.length) { el.innerHTML = '<div class="empty-state">該当するアイテムがありません</div>'; return; }
  el.innerHTML = items.map(function(item) {
    var sel = selectedItems.some(function(s) { return s.id === item.id; });
    var thumb = item.thumb_url || item.ogp_thumb || '';
    var tagList = [item.category, item.usage, item.area, item.tone].filter(Boolean).slice(0,4);
    return '<div class="result-card ' + (sel ? 'selected' : '') + '" onclick="toggleSelect(\'' + item.id + '\')">' +
      '<div class="result-thumb-wrap">' +
        (thumb ? '<img class="result-thumb" src="' + esc(thumb) + '" alt="" loading="lazy" />' : '<div class="result-no-thumb">' + sourceEmoji(item.source) + '</div>') +
        '<div class="result-source-badge">' + esc(item.source || '自社') + '</div>' +
        '<div class="result-check">✓</div>' +
      '</div>' +
      '<div class="result-info"><div class="result-title">' + esc(item.file_name || '無題') + '</div>' +
        '<div class="result-tags">' + tagList.map(function(t) { return '<span class="result-tag">' + esc(t) + '</span>'; }).join('') + '</div>' +
      '</div></div>';
  }).join('');
}

// ============================================================
// RENDER: フィルターチップ（category / usage のみ単一選択）
// ============================================================
function renderFilterChips() {
  ['category', 'usage', 'area', 'tone'].forEach(function(axis) {
    var el = document.getElementById('filter-' + axis);
    if (!el) return;
    el.innerHTML = (tags[axis] || []).map(function(tag) {
      return '<button class="chip" data-axis="' + axis + '" data-value="' + tag + '" onclick="toggleFilter(\'' + axis + '\',\'' + tag + '\',this)">' + esc(tag) + '</button>';
    }).join('');
  });
}

// ============================================================
// RENDER: モーダルタグチップ（area・tone は複数選択）
// ============================================================
function renderModalTagChips() {
  ['category','usage','area','tone','cost','structure'].forEach(function(axis) {
    var el = document.getElementById('modal-' + axis);
    if (!el) return;
    var isMulti = MULTI_SELECT_AXES.indexOf(axis) >= 0;
    el.innerHTML = (tags[axis] || []).map(function(tag) {
      return '<button class="chip ' + (isMulti ? 'multi' : '') + '" data-axis="' + axis + '" data-value="' + tag + '" onclick="selectModalTag(\'' + axis + '\',\'' + tag + '\',this)">' +
        esc(tag) +
      '</button>';
    }).join('');
    if (isMulti) {
      var label = el.closest('.tag-group') && el.closest('.tag-group').querySelector('.tag-group-label');
      if (label && !label.querySelector('.multi-hint')) {
        var hint = document.createElement('span');
        hint.className = 'multi-hint';
        hint.textContent = '複数選択可';
        label.appendChild(hint);
      }
    }
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

// ============================================================
// タグモーダル（area・tone は複数選択対応）
// ============================================================
function setupTagModal() {
  var mClose = document.getElementById('modal-close');
  if (mClose) mClose.addEventListener('click', closeTagModal);
  var mSkip = document.getElementById('modal-skip');
  if (mSkip) mSkip.addEventListener('click', closeTagModal);
  var mSave = document.getElementById('modal-save');
  if (mSave) mSave.addEventListener('click', saveTagModal);
}

function openTagModal(id) {
  var item = allItems.find(function(i) { return i.id === id; });
  if (!item) return;
  currentItemId = id;
  var thumb = document.getElementById('modal-thumb');
  var src = item.thumb_url || item.ogp_thumb || '';
  if (thumb) { thumb.src = src; thumb.style.display = src ? 'block' : 'none'; }
  var titleEl = document.getElementById('modal-item-title');
  if (titleEl) titleEl.textContent = item.file_name || '無題';

  // チップリセット
  document.querySelectorAll('.tag-chips .chip').forEach(function(b) { b.classList.remove('active'); });

  // 既存タグ反映（area・toneはカンマ区切りで複数）
  ['category','usage','area','tone','cost','structure'].forEach(function(axis) {
    if (item[axis]) {
      var el = document.getElementById('modal-' + axis);
      if (!el) return;
      var values = item[axis].split(',').map(function(v) { return v.trim(); });
      values.forEach(function(val) {
        var b = el.querySelector('[data-value="' + val + '"]');
        if (b) b.classList.add('active');
      });
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
  if (MULTI_SELECT_AXES.indexOf(axis) >= 0) {
    // 複数選択：トグル
    btn.classList.toggle('active');
  } else {
    // 単一選択
    var parent = document.getElementById('modal-' + axis);
    if (parent) parent.querySelectorAll('.chip').forEach(function(b) { b.classList.remove('active'); });
    btn.classList.add('active');
  }
}

function saveTagModal() {
  if (!currentItemId) return;
  // 必須チェック：category・usage
  var required = ['category', 'usage'];
  for (var i = 0; i < required.length; i++) {
    var el = document.getElementById('modal-' + required[i]);
    if (!el || !el.querySelector('.chip.active')) {
      showToast(axisLabel(required[i]) + ' を選択してください');
      return;
    }
  }

  var data = { action: 'updateTags', id: currentItemId };
  ['category','usage','area','tone','cost','structure'].forEach(function(axis) {
    var el = document.getElementById('modal-' + axis);
    if (!el) return;
    var selected = Array.from(el.querySelectorAll('.chip.active')).map(function(b) { return b.getAttribute('data-value'); });
    if (selected.length) data[axis] = selected.join(',');
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
// プロンプト生成（画像認識 → nano banana Pro構文）
// ============================================================
function setupPrompt() {
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
    var sc = document.getElementById('selected-count');
    if (sc) sc.textContent = 0;
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
  if (outText) outText.textContent = '';
  if (outArea) outArea.style.display = 'none';

  var item = selectedItems[0] || null;
  var imageUrl = item ? (item.thumb_url || item.ogp_thumb || '') : '';
  var refUrl = document.getElementById('ref-image-url') ? document.getElementById('ref-image-url').value : '';

  var prompt = '';

  if (imageUrl && apiKey) {
    // 画像認識モード：Anthropic APIで画像を解析
    try {
      prompt = await generatePromptFromImage(imageUrl, item, refUrl);
    } catch(e) {
      console.error('画像認識失敗、タグベースにフォールバック:', e);
      prompt = generatePromptFromTags(item, refUrl);
    }
  } else if (imageUrl && !apiKey) {
    // APIキー未設定 → タグベース＋メッセージ
    prompt = generatePromptFromTags(item, refUrl);
    showToast('APIキー未設定のためタグベースで生成しました');
  } else if (item) {
    // タグベースモード（画像URLなし）
    prompt = generatePromptFromTags(item, refUrl);
  } else {
    prompt = 'アイテムを選択してください（検索タブで写真をタップ）';
  }

  if (outText) outText.textContent = prompt;
  if (outArea) outArea.style.display = 'block';
  if (genBtn) { genBtn.disabled = false; genBtn.innerHTML = '<span class="generate-icon">✦</span> プロンプトを生成'; }
}

// ---- 画像認識プロンプト生成（Anthropic API） ----
async function generatePromptFromImage(imageUrl, item, refUrl) {
  var systemPrompt = [
    'あなたはイベント装飾・演出のプロフェッショナルです。',
    '提供された画像を詳細に分析し、nano banana Pro（画像生成AI）用のプロンプトを英語で生成してください。',
    '',
    '【nano banana Proの黄金構文】',
    '[主役/アクション] + [スタイル/手法] + [詳細な環境/背景] + [照明/色調] + [構図/カメラ設定]',
    '',
    '【生成ルール】',
    '・「1枚の写真を説明する」ように自然な英語文章で書く',
    '・タグの羅列は禁止。具体的で説明的な文章にする',
    '・装飾の素材・色・形状・規模感・雰囲気を具体的に記述する',
    '・照明の質感・カラートーンを明記する',
    '・最後に必ずクオリティキーワードを追加する:',
    '  Photorealistic, Highly detailed texture, Soft shadows, Depth of field, Shot on 35mm lens, f/1.8.',
    '・出力はプロンプトテキストのみ（説明文不要）',
  ].join('\n');

  var userContent = [
    { type: 'image', source: { type: 'url', url: imageUrl } },
    { type: 'text', text: 'この装飾・演出画像を分析し、nano banana Pro用プロンプトを生成してください。' + (refUrl ? '\n参考スタイルURL: ' + refUrl : '') }
  ];

  var response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userContent }]
    })
  });

  var data = await response.json();
  if (data.content && data.content[0] && data.content[0].text) {
    return data.content[0].text.trim();
  }
  throw new Error('API response empty');
}

// ---- タグベースプロンプト生成（フォールバック） ----
var CATEGORY_EN = {'すぐ見て':'featured decoration','実績資料':'portfolio decoration','案件資料':'project decoration','宣伝PR':'promotional decoration','イベント':'event decoration','雑学':'decorative reference','AI情報':'AI-inspired decoration','勉強用':'educational decoration','BIZ資料':'business decoration','注意喚起':'alert decoration','なんでもBOX':'miscellaneous decoration'};
var USAGE_EN    = {'AI界':'AI industry event','BIZ界':'business event','宣伝界':'promotional event','雑学界':'general event','装飾(演)':'decorative performance','照明(演)':'lighting performance','映像(演)':'video projection performance','機材工具':'equipment reference','部材資料':'materials reference','技法工法':'technique reference'};
var AREA_EN     = {'屋内':'indoor venue','屋外':'outdoor space','小型':'small-scale','大型':'large-scale','ゲート':'entrance gate','ステージ':'stage area','キッズエリア':'kids area','導線':'guest flow path','展示':'exhibition space','フォトスポ':'photo spot','看板':'signage area','エントランス':'entrance hall','その他':'event space'};
var TONE_EN     = {'エレガント':'elegant and refined','ポップ':'vibrant and playful','ラグジュアリー':'luxurious and high-end','クール':'cool and contemporary','キッズ':'fun and kid-friendly','シンプル':'clean and minimal','モノトン':'monochromatic','カラフル':'colorful and vivid','ネイチャー':'natural and organic','フラワー':'floral and botanical','ビビット':'vivid and saturated','派手':'bold and extravagant','地味':'understated and subtle'};
var LIGHT_EN    = {'golden-hour':'golden hour warm sunlight','neon-reflection':'neon reflections on glossy surfaces','soft-ambient':'soft ambient diffused lighting'};
var ANGLE_EN    = {'wide-angle':'Shot with ultra wide-angle lens','close-up':'Close-up detail shot','top-down':'Top-down aerial view'};

function generatePromptFromTags(item, refUrl) {
  if (!item) return 'アイテムを選択してください';
  var catEn   = CATEGORY_EN[item.category] || item.category || 'event decoration';
  var usageEn = USAGE_EN[item.usage]       || item.usage    || 'event';
  var areas   = item.area ? item.area.split(',').map(function(a) { return AREA_EN[a.trim()] || a.trim(); }) : [];
  var tones   = item.tone ? item.tone.split(',').map(function(t) { return TONE_EN[t.trim()] || t.trim(); }) : [];
  var lightEn = LIGHT_EN[promptOptions.lighting] || '';
  var angleEn = ANGLE_EN[promptOptions.angle]    || '';

  var p = 'A ' + catEn;
  if (areas.length) p += ' ' + areas[0];
  p += ' for a ' + usageEn + ' setting';
  if (tones.length) p += ', ' + tones.join(' and ') + ' atmosphere';
  if (areas.length > 1) p += ', featuring ' + areas.slice(1).join(' and ');
  p += '.\n';
  if (lightEn) p += lightEn + '.\n';
  if (angleEn) p += angleEn + '.\n';
  p += 'Photorealistic, Highly detailed texture, Soft shadows, Depth of field, Shot on 35mm lens, f/1.8.';
  if (refUrl) p = 'Based on this reference image style, create a similar composition.\n\n' + p;
  return p;
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
  var map = {category:'カテゴリ',usage:'用途',area:'エリア＆サイズ感',tone:'トンマナ',cost:'コスト感',structure:'施工特性'};
  return map[axis] || axis;
}
