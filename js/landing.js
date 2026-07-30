// ============================================
// البحث بالهيرو - يوجّه لصفحة تسجيل الدخول
// (البحث والحجز الفعلي يحتاج حساب مسجّل دخول)
// ============================================
document.getElementById('hero-search-form').addEventListener('submit', (e) => {
  e.preventDefault();
  window.location.href = 'login.html';
});

// ============================================
// أحدث العيادات الفعّالة (قراءة عامة، بدون تسجيل دخول)
// ============================================
async function loadLatestClinics() {
  const wrap = document.getElementById('latest-clinics-wrap');

  try {
    const snap = await db.collection('users')
      .where('role', '==', 'clinic')
      .where('status', '==', 'active')
      .get();

    const clinics = snap.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .sort((a, b) => {
        if (!a.createdAt || !b.createdAt) return 0;
        return b.createdAt.toMillis() - a.createdAt.toMillis();
      })
      .slice(0, 6);

    if (clinics.length === 0) {
      wrap.innerHTML = '<p class="empty-state">ما فيه عيادات مسجّلة بعد، كن أول عيادة تنضم!</p>';
      return;
    }

    wrap.innerHTML = `
      <div class="clinics-preview-grid">
        ${clinics.map((c) => `
          <a href="login.html" class="clinic-preview-card">
            <p class="cp-name">${escapeHtml(c.name)}</p>
            <p class="cp-sub">عيادة مسجّلة ومفعّلة</p>
          </a>
        `).join('')}
      </div>
    `;
  } catch (err) {
    console.error('loadLatestClinics error:', err);
    wrap.innerHTML = '<p class="empty-state">تعذر تحميل العيادات حالياً</p>';
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

loadLatestClinics();
