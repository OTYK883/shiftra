// ============================================================
// Siftra — sw.js
// Service Worker: キャッシュ戦略 + Share Target受信
// ============================================================

const CACHE_NAME    = 'siftra-v5';
const STATIC_ASSETS = [
  '/shiftra/',
  '/shiftra/index.html',
  '/shiftra/style.css',
  '/shiftra/app.js',
  '/shiftra/manifest.json',
];

// ============================================================
// インストール：静的アセットをキャッシュ
// ============================================================
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(STATIC_ASSETS);
    }).then(function() {
      return self.skipWaiting();
    })
  );
});

// ============================================================
// アクティベート：古いキャッシュを削除
// ============================================================
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE_NAME; })
            .map(function(k) { return caches.delete(k); })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

// ============================================================
// フェッチ：Cache First（静的）/ Network First（GAS API）
// ============================================================
self.addEventListener('fetch', function(event) {
  var url = new URL(event.request.url);

  // Share Target 受信（GETパラメータ処理）
  if (url.pathname === '/shiftra/share-target') {
    event.respondWith(handleShareTarget(event.request));
    return;
  }

  // GAS・外部APIはネットワーク優先（キャッシュしない）
  if (url.hostname.includes('script.google.com') ||
      url.hostname.includes('api.anthropic.com') ||
      url.hostname.includes('fonts.googleapis.com') ||
      url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // 静的アセット：Cache First
  event.respondWith(
    caches.match(event.request).then(function(cached) {
      if (cached) return cached;
      return fetch(event.request).then(function(response) {
        if (!response || response.status !== 200 || response.type === 'opaque') return response;
        var toCache = response.clone();
        caches.open(CACHE_NAME).then(function(cache) { cache.put(event.request, toCache); });
        return response;
      });
    }).catch(function() {
      // オフライン時はルートHTMLを返す
      return caches.match('/shiftra/index.html');
    })
  );
});

// ============================================================
// Share Target 処理
// SNSの共有ボタン → ここでURLを受けてアプリに渡す
// ============================================================
async function handleShareTarget(request) {
  var url  = new URL(request.url);
  var sharedUrl   = url.searchParams.get('url')   || '';
  var sharedText  = url.searchParams.get('text')  || '';
  var sharedTitle = url.searchParams.get('title') || '';

  // URLが textに入ってくる場合も対応（Twitterなど）
  var finalUrl = sharedUrl || extractUrl(sharedText) || sharedText;

  // クライアント（開いているタブ）に送信
  var clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  if (clients.length > 0) {
    clients[0].postMessage({
      type: 'SHARE_TARGET',
      url:   finalUrl,
      text:  sharedText,
      title: sharedTitle,
    });
    // すでに開いているウィンドウにフォーカス
    clients[0].focus();
  } else {
    // アプリが開いていない → 新しいウィンドウで開いてメッセージを保留
    var client = await self.clients.openWindow('/shiftra/?share=' + encodeURIComponent(finalUrl));
    if (client) {
      setTimeout(function() {
        client.postMessage({
          type: 'SHARE_TARGET',
          url:   finalUrl,
          text:  sharedText,
          title: sharedTitle,
        });
      }, 2000);
    }
  }

  // 共有受信後はアプリのトップにリダイレクト
  return Response.redirect('/shiftra/', 303);
}

function extractUrl(text) {
  if (!text) return '';
  var match = text.match(/https?:\/\/[^\s]+/);
  return match ? match[0] : '';
}

// ============================================================
// プッシュ通知（将来用）
// ============================================================
self.addEventListener('push', function(event) {
  if (!event.data) return;
  var data = event.data.json();
  self.registration.showNotification(data.title || 'Siftra', {
    body: data.body || '',
    icon: '/shiftra/icons/icon-192.png',
    badge: '/shiftra/icons/icon-192.png',
  });
});
