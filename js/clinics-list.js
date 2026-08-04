let allClinicsList = [];

async function initClinicsList() {
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

  wrap.innerHTML = clinics.map((c) => {
    const logoInner = c.logoUrl
      ? `<img src="${c.logoUrl}" alt="${escapeHtml(c.name)}" class="clinic-list-card-logo-img">`
      : escapeHtml((c.name || '؟').trim().slice(0, 1));
    const logoStyle = c.logoUrl ? '' : `background:${avatarColor(c.name)}`;

    return `
    <a href="clinic-profile.html?id=${c.id}" class="clinic-list-card">
      <div class="clinic-list-card-logo" style="${logoStyle}">${logoInner}</div>
      <div class="clinic-list-card-info">
        <p class="clinic-list-card-name">${escapeHtml(c.name)}</p>
        ${c.address ? `<p class="clinic-list-card-address">📍 ${escapeHtml(c.address)}</p>` : ''}
      </div>
      <span class="clinic-list-card-arrow">‹</span>
    </a>
  `;
  }).join('');
}

document.getElementById('clinics-search-input').addEventListener('input', (e) => {
  const query = e.target.value.trim();
  const filtered = query
    ? allClinicsList.filter((c) => c.name && c.name.includes(query))
    : allClinicsList;
  renderClinicsList(filtered);
});

function onLanguageChanged() {
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

const AVATAR_COLORS = ['#158A7E', '#0F2440', '#1C6B93', '#2E9E6D', '#4A7A9E', '#0E7A72'];
function avatarColor(name) {
  let hash = 0;
  for (let i = 0; i < (name || '').length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
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
