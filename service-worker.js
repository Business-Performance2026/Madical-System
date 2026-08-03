// ============================================
// Service Worker بسيط جداً — هدفه الأساسي تفعيل خاصية "التثبيت الحقيقي" (WebAPK) على أندرويد،
// وليس توفير عمل بدون إنترنت (Offline). كل الطلبات تمر مباشرة للشبكة بدون أي تخزين مؤقت،
// عشان المستخدم يشوف دايماً آخر نسخة من الموقع (بدون مفاجآت محتوى قديم محفوظ).
// ============================================

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// لازم نستجيب لحدث fetch عشان متصفح كروم يعتبر الموقع "قابل للتثبيت الحقيقي"،
// حتى لو كان ردّنا هو نفس طلب الشبكة العادي بدون أي تخزين مؤقت
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
