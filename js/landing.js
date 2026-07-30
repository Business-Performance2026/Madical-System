// ============================================
// تحميل العيادات الفعّالة والأطباء (قراءة عامة، بدون تسجيل دخول)
// ============================================
let allClinics = [];
let allDoctors = [];
let activeSpecialty = '';
let searchQuery = '';

const SPECIALTIES = ['أسنان', 'جلدية', 'أطفال', 'باطنية', 'عيون', 'عظام'];

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

    renderStatsLine();
    renderSpecialtyCounts();
    renderDirectory();
  } catch (err) {
    console.error('initLanding error:', err);
    document.getElementById('clinics-directory-wrap').innerHTML =
      '<p class="empty-state">تعذر تحميل العيادات حالياً</p>';
  }
}

function renderStatsLine() {
  const specialtiesCount = new Set(allDoctors.map((d) => d.specialty).filter(Boolean)).size;
  document.getElementById('hero-stats-line').textContent =
    `${allClinics.length} عيادة مسجّلة • ${allDoctors.length} طبيب • ${specialtiesCount} تخصص متوفر`;
}

// عدد العيادات لكل تخصص، يظهر بجانب كل تبويب تخصص
function renderSpecialtyCounts() {
  SPECIALTIES.forEach((spec) => {
    const clinicIds = new Set(
      allDoctors.filter((d) => d.specialty && d.specialty.includes(spec)).map((d) => d.clinicId)
    );
    const el = document.querySelector(`[data-count-for="${spec}"]`);
    if (el) el.textContent = clinicIds.size > 0 ? clinicIds.size : '';
  });
}

// ============================================
// البحث + فلتر التخصص (يشتغلون مع بعض)
// ============================================
document.getElementById('hero-search-form').addEventListener('submit', (e) => {
  e.preventDefault();
  searchQuery = document.getElementById('hero-search-input').value.trim();
  renderDirectory();
});

document.querySelectorAll('.specialty-pill').forEach((pill) => {
  pill.addEventListener('click', () => {
    activeSpecialty = pill.dataset.specialty;
    document.querySelectorAll('.specialty-pill').forEach((p) => p.classList.remove('active'));
    pill.classList.add('active');
    renderDirectory();
  });
});

function getFilteredClinics() {
  return allClinics.filter((c) => {
    const clinicDoctors = allDoctors.filter((d) => d.clinicId === c.id);

    const matchesSpecialty = !activeSpecialty
      || clinicDoctors.some((d) => d.specialty && d.specialty.includes(activeSpecialty));

    const matchesSearch = !searchQuery
      || (c.name && c.name.includes(searchQuery))
      || clinicDoctors.some((d) =>
          (d.specialty && d.specialty.includes(searchQuery)) || (d.name && d.name.includes(searchQuery))
        );

    return matchesSpecialty && matchesSearch;
  });
}

function renderDirectory() {
  const results = getFilteredClinics();

  const titleEl = document.getElementById('directory-title');
  const hintEl = document.getElementById('directory-hint');

  if (activeSpecialty || searchQuery) {
    const parts = [];
    if (searchQuery) parts.push(`"${searchQuery}"`);
    if (activeSpecialty) parts.push(activeSpecialty);
    titleEl.textContent = `نتائج البحث: ${parts.join(' • ')}`;
    hintEl.textContent = `${results.length} عيادة مطابقة`;
  } else {
    titleEl.textContent = 'كل العيادات';
    hintEl.textContent = 'تصفح مجاني بالكامل — تسجيل الدخول يلزم بس وقت الحجز الفعلي';
  }

  const wrap = document.getElementById('clinics-directory-wrap');

  if (results.length === 0) {
    wrap.innerHTML = '<p class="empty-state">ما فيه عيادات مطابقة، جرب تخصص أو كلمة بحث ثانية</p>';
    return;
  }

  wrap.innerHTML = `
    <div class="clinics-directory-grid">
      ${results.map((c) => renderClinicCard(c)).join('')}
    </div>
  `;
}

function renderClinicCard(c) {
  const doctors = allDoctors.filter((d) => d.clinicId === c.id);
  const specialties = [...new Set(doctors.map((d) => d.specialty).filter(Boolean))];

  return `
    <a href="login.html" class="clinic-directory-card">
      <div class="clinic-card-top">
        <div class="clinic-avatar" style="background:${avatarColor(c.name)}">${escapeHtml(initials(c.name))}</div>
        <div>
          <p class="cp-name">${escapeHtml(c.name)}</p>
          <p class="cp-doctor-count">${doctors.length} ${doctors.length === 1 ? 'طبيب' : 'أطباء'}</p>
        </div>
      </div>
      <div class="clinic-card-tags">
        ${specialties.length > 0
          ? specialties.slice(0, 4).map((s) => `<span class="specialty-tag">${escapeHtml(s)}</span>`).join('')
          : '<span class="specialty-tag specialty-tag-muted">ما تم إضافة تخصصات بعد</span>'}
      </div>
      <span class="clinic-card-cta">احجز الآن ←</span>
    </a>
  `;
}

// ============================================
// أدوات مساعدة
// ============================================
function initials(name) {
  if (!name) return '؟';
  return name.trim().slice(0, 1);
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

initLanding();
