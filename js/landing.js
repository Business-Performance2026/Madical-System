// ============================================
// تحميل العيادات الفعّالة والأطباء (قراءة عامة، بدون تسجيل دخول)
// ============================================
let allClinics = [];
let allDoctors = [];

async function initLanding() {
  try {
    const clinicsSnap = await db.collection('users')
      .where('role', '==', 'clinic')
      .where('status', '==', 'active')
      .get();

    allClinics = clinicsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

    const clinicIds = new Set(allClinics.map((c) => c.id));
    const doctorsSnap = await db.collection('doctors').get();

    allDoctors = doctorsSnap.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .filter((d) => clinicIds.has(d.clinicId));

    renderLatestClinics();
  } catch (err) {
    console.error('initLanding error:', err);
    document.getElementById('latest-clinics-wrap').innerHTML =
      '<p class="empty-state">تعذر تحميل العيادات حالياً</p>';
  }
}

// ============================================
// أحدث العيادات الفعّالة
// ============================================
function renderLatestClinics() {
  const wrap = document.getElementById('latest-clinics-wrap');

  const clinics = [...allClinics]
    .sort((a, b) => {
      if (!a.createdAt || !b.createdAt) return 0;
      return b.createdAt.toMillis() - a.createdAt.toMillis();
    })
    .slice(0, 6);

  if (clinics.length === 0) {
    wrap.innerHTML = '<p class="empty-state">ما فيه عيادات مسجّلة بعد، كن أول عيادة تنضم!</p>';
    return;
  }

  wrap.innerHTML = renderClinicCards(clinics);
}

// ============================================
// البحث + التصفح حسب التخصص (بدون تسجيل دخول)
// ============================================
document.getElementById('hero-search-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const query = document.getElementById('hero-search-input').value.trim();
  performSearch(query);
});

document.querySelectorAll('.specialty-chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    document.getElementById('hero-search-input').value = chip.dataset.specialty;
    performSearch(chip.dataset.specialty);
  });
});

function performSearch(query) {
  if (!query) return;

  const matchedClinicIds = new Set();

  allClinics.forEach((c) => {
    if (c.name && c.name.includes(query)) matchedClinicIds.add(c.id);
  });
  allDoctors.forEach((d) => {
    if ((d.specialty && d.specialty.includes(query)) || (d.name && d.name.includes(query))) {
      matchedClinicIds.add(d.clinicId);
    }
  });

  const results = allClinics.filter((c) => matchedClinicIds.has(c.id));
  renderSearchResults(query, results);
}

function renderSearchResults(query, results) {
  const section = document.getElementById('search-results-section');
  section.classList.remove('hidden');
  section.scrollIntoView({ behavior: 'smooth', block: 'start' });

  document.getElementById('search-results-title').textContent = `نتائج البحث عن "${query}"`;

  const wrap = document.getElementById('search-results-wrap');

  if (results.length === 0) {
    wrap.innerHTML = '<p class="empty-state">ما فيه نتائج مطابقة، جرب كلمة ثانية</p>';
    return;
  }

  wrap.innerHTML = renderClinicCards(results);
}

// ============================================
// أدوات مساعدة
// ============================================
function renderClinicCards(clinics) {
  return `
    <div class="clinics-preview-grid">
      ${clinics.map((c) => {
        const doctors = allDoctors.filter((d) => d.clinicId === c.id);
        const specialties = [...new Set(doctors.map((d) => d.specialty).filter(Boolean))];
        return `
          <a href="login.html" class="clinic-preview-card">
            <p class="cp-name">${escapeHtml(c.name)}</p>
            <p class="cp-sub">${specialties.length ? escapeHtml(specialties.join('، ')) : 'عيادة مسجّلة ومفعّلة'}</p>
          </a>
        `;
      }).join('')}
    </div>
  `;
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

initLanding();
