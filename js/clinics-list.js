let allClinicsList = [];

async function initClinicsList() {
  updateBackArrowDirection();

  const wrap = document.getElementById('clinics-list-wrap');

  try {
    const snap = await db.collection('users')
      .where('role', '==', 'clinic')
      .where('status', '==', 'active')
      .get();

    allClinicsList = snap.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .filter((c) => !c.parentClinicId) // نستثني الفروع - تظهر بس جوا ملف العيادة الأم
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ar'));

    renderClinicsList(allClinicsList);
  } catch (err) {
    console.error('initClinicsList error:', err);
    wrap.innerHTML = `<p class="empty-state">${t('load_error')}</p>`;
  }
}

function renderClinicsList(clinics) {
  const wrap = document.getElementById('clinics-list-wrap');

  if (clinics.length === 0) {
    wrap.innerHTML = `<p class="empty-state">${t('no_clinics_match')}</p>`;
    return;
  }

  wrap.innerHTML = clinics.map((c) => `
    <div class="clinic-list-card">
      <a href="clinic-profile.html?id=${c.id}" class="clinic-list-card-name">${escapeHtml(c.name)}</a>
      <a href="login.html?clinic=${c.id}" class="btn-primary clinic-list-card-btn">${t('profile_book_now_short')}</a>
    </div>
  `).join('');
}

document.getElementById('clinics-search-input').addEventListener('input', (e) => {
  const query = e.target.value.trim();
  const filtered = query
    ? allClinicsList.filter((c) => c.name && c.name.includes(query))
    : allClinicsList;
  renderClinicsList(filtered);
});

// سهم الرجوع
document.getElementById('back-btn').addEventListener('click', () => {
  if (document.referrer && document.referrer.includes(window.location.host)) {
    history.back();
  } else {
    window.location.href = 'index.html';
  }
});

function updateBackArrowDirection() {
  const svg = document.querySelector('#back-btn svg path');
  if (!svg) return;
  const pointLeft = 'M17 3l1.4 1.4L9.8 13l8.6 8.6L17 23 7 13z';
  const pointRight = 'M7 3L5.6 4.4 14.2 13l-8.6 8.6L7 23l10-10z';
  svg.setAttribute('d', currentLang === 'ar' ? pointRight : pointLeft);
}

function onLanguageChanged() {
  updateBackArrowDirection();
  renderClinicsList(allClinicsList);
}

// يظهر الشريط السفلي وزر تسجيل الدخول بشكل صحيح حسب حالة الدخول (نفس منطق باقي الصفحات العامة)
function checkPatientBottomNav() {
  const bottomNav = document.getElementById('patient-bottom-nav');
  const loginBtn = document.getElementById('nav-login-btn');
  if (!bottomNav || typeof auth === 'undefined') return;

  auth.onAuthStateChanged(async (user) => {
    if (!user) {
      bottomNav.classList.add('hidden');
      document.body.classList.remove('has-bottom-nav');
      if (loginBtn) loginBtn.classList.remove('hidden');
      return;
    }

    try {
      const userDoc = await db.collection('users').doc(user.uid).get();
      if (userDoc.exists && userDoc.data().role === 'patient' && userDoc.data().status === 'active') {
        bottomNav.classList.remove('hidden');
        document.body.classList.add('has-bottom-nav');
        if (loginBtn) loginBtn.classList.add('hidden');
      } else {
        bottomNav.classList.add('hidden');
        document.body.classList.remove('has-bottom-nav');
        if (loginBtn) loginBtn.classList.remove('hidden');
      }
    } catch (err) {
      console.error('checkPatientBottomNav error:', err);
    }
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

initClinicsList();
checkPatientBottomNav();
