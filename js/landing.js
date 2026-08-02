// ============================================
// دعم اللغتين (عربي/إنجليزي)
// ============================================
const translations = {
  ar: {
    nav_login: 'تسجيل الدخول',
    hero_title: 'دليل العيادات — دوّر واحجز بثواني',
    hero_sub: 'ابحث باسم العيادة أو التخصص، وشوف الأطباء والأوقات المتاحة فوراً',
    hero_search_placeholder: 'دوّر على تخصص أو اسم عيادة...',
    hero_search_btn: 'ابحث',
    spec_all: 'الكل',
    spec_dental: 'أسنان',
    spec_derma: 'جلدية',
    spec_peds: 'أطفال',
    spec_internal: 'باطنية',
    spec_eye: 'عيون',
    spec_ortho: 'عظام',
    directory_all: 'كل العيادات',
    loading_clinics: 'جاري تحميل العيادات...',
    cta_title: 'جاهز تحجز موعدك؟',
    cta_sub: 'سجّل حساب مجاني كمريض، أو سجّل عيادتك عشان تستقبل حجوزات جديدة',
    cta_btn: 'ابدأ الآن',
    footer_text: '© موعد — نظام حجز مواعيد العيادات',
    stats_line: (clinics, doctors, specs) => `${clinics} عيادة مسجّلة • ${doctors} طبيب • ${specs} تخصص متوفر`,
    search_results: (parts) => `نتائج البحث: ${parts.join(' • ')}`,
    matching_count: (n) => `${n} عيادة مطابقة`,
    no_match: 'ما فيه عيادات مطابقة، جرب تخصص أو كلمة بحث ثانية',
    load_error: 'تعذر تحميل العيادات حالياً',
    doctor_count: (n) => `${n} ${n === 1 ? 'طبيب' : 'أطباء'}`,
    no_specialties: 'ما تم إضافة تخصصات بعد',
    book_now: 'احجز الآن ←',
    lang_toggle: 'English',
  },
  en: {
    nav_login: 'Login',
    hero_title: 'Clinic Directory — Search & Book in Seconds',
    hero_sub: 'Search by clinic name or specialty, and see available doctors and times instantly',
    hero_search_placeholder: 'Search by specialty or clinic name...',
    hero_search_btn: 'Search',
    spec_all: 'All',
    spec_dental: 'Dental',
    spec_derma: 'Dermatology',
    spec_peds: 'Pediatrics',
    spec_internal: 'Internal Medicine',
    spec_eye: 'Ophthalmology',
    spec_ortho: 'Orthopedics',
    directory_all: 'All Clinics',
    loading_clinics: 'Loading clinics...',
    cta_title: 'Ready to book your appointment?',
    cta_sub: 'Create a free patient account, or register your clinic to start receiving bookings',
    cta_btn: 'Get Started',
    footer_text: '© Mawid — Clinic Appointment Booking System',
    stats_line: (clinics, doctors, specs) => `${clinics} registered clinics • ${doctors} doctors • ${specs} specialties available`,
    search_results: (parts) => `Search results: ${parts.join(' • ')}`,
    matching_count: (n) => `${n} matching clinics`,
    no_match: 'No matching clinics, try a different specialty or search term',
    load_error: 'Could not load clinics right now',
    doctor_count: (n) => `${n} ${n === 1 ? 'doctor' : 'doctors'}`,
    no_specialties: 'No specialties added yet',
    book_now: '→ Book Now',
    lang_toggle: 'العربية',
  },
};

let currentLang = localStorage.getItem('mawid_lang') || 'ar';

function t(key, ...args) {
  const entry = translations[currentLang][key];
  return typeof entry === 'function' ? entry(...args) : entry;
}

function applyLanguage(lang) {
  currentLang = lang;
  localStorage.setItem('mawid_lang', lang);

  document.getElementById('html-root').setAttribute('lang', lang);
  document.getElementById('html-root').setAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
  document.getElementById('lang-toggle-btn').textContent = t('lang_toggle');

  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.dataset.i18n;
    if (translations[lang][key]) el.textContent = translations[lang][key];
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    const key = el.dataset.i18nPlaceholder;
    if (translations[lang][key]) el.placeholder = translations[lang][key];
  });

  // نعيد رسم المحتوى الحي (يعتمد على بيانات من قاعدة البيانات) بنفس اللغة الجديدة
  renderStatsLine();
  renderDirectory();
}

document.getElementById('lang-toggle-btn').addEventListener('click', () => {
  applyLanguage(currentLang === 'ar' ? 'en' : 'ar');
});

// ============================================
// تحميل العيادات الفعّالة والأطباء (قراءة عامة، بدون تسجيل دخول)
// ============================================
let allClinics = [];
let allDoctors = [];
let activeSpecialty = '';
let searchQuery = '';

const SPECIALTIES = ['أسنان', 'جلدية', 'أطفال', 'باطنية', 'عيون', 'عظام'];

async function initLanding() {
  applyLanguage(currentLang);

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
      `<p class="empty-state">${t('load_error')}</p>`;
  }
}

function renderStatsLine() {
  const specialtiesCount = new Set(allDoctors.map((d) => d.specialty).filter(Boolean)).size;
  document.getElementById('hero-stats-line').textContent =
    t('stats_line', allClinics.length, allDoctors.length, specialtiesCount);
}

// عدد العيادات لكل تخصص، يظهر بجانب كل تبويب تخصص
function renderSpecialtyCounts() {
  SPECIALTIES.forEach((spec) => {
    const normalizedSpec = normalizeArabic(spec);
    const clinicIds = new Set(
      allDoctors
        .filter((d) => d.specialty && normalizeArabic(d.specialty).includes(normalizedSpec))
        .map((d) => d.clinicId)
    );
    const el = document.querySelector(`[data-count-for="${spec}"]`);
    if (el) el.textContent = clinicIds.size > 0 ? clinicIds.size : '';
  });
}

// ============================================
// البحث + فلتر التخصص (يشتغلون مع بعض)
// ============================================
// تطبيع النص العربي: توحيد أشكال الهمزة والألف وغيرها،
// عشان البحث يشتغل صح سواء كتب "أسنان" أو "اسنان"
function normalizeArabic(text) {
  if (!text) return '';
  return text
    .replace(/[إأآا]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .trim()
    .toLowerCase();
}

let searchDebounceTimer = null;
const heroSearchInput = document.getElementById('hero-search-input');

document.getElementById('hero-search-form').addEventListener('submit', (e) => {
  e.preventDefault();
  searchQuery = heroSearchInput.value.trim();
  renderDirectory();
});

// بحث حي أثناء الكتابة (وأهم شي: يتحدث فوراً لما تمسح الكلمة كاملة)
heroSearchInput.addEventListener('input', () => {
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => {
    searchQuery = heroSearchInput.value.trim();
    renderDirectory();
  }, 200);
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
  const normalizedQuery = normalizeArabic(searchQuery);
  const normalizedSpecialty = normalizeArabic(activeSpecialty);

  return allClinics.filter((c) => {
    const clinicDoctors = allDoctors.filter((d) => d.clinicId === c.id);

    const matchesSpecialty = !activeSpecialty
      || clinicDoctors.some((d) => d.specialty && normalizeArabic(d.specialty).includes(normalizedSpecialty));

    const matchesSearch = !searchQuery
      || (c.name && normalizeArabic(c.name).includes(normalizedQuery))
      || clinicDoctors.some((d) =>
          (d.specialty && normalizeArabic(d.specialty).includes(normalizedQuery))
          || (d.name && normalizeArabic(d.name).includes(normalizedQuery))
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
    titleEl.textContent = t('search_results', parts);
    hintEl.textContent = t('matching_count', results.length);
  } else {
    titleEl.textContent = t('directory_all');
    hintEl.textContent = '';
  }

  const wrap = document.getElementById('clinics-directory-wrap');

  if (results.length === 0) {
    wrap.innerHTML = `<p class="empty-state">${t('no_match')}</p>`;
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
          <p class="cp-doctor-count">${t('doctor_count', doctors.length)}</p>
        </div>
      </div>
      <div class="clinic-card-tags">
        ${specialties.length > 0
          ? specialties.slice(0, 4).map((s) => `<span class="specialty-tag">${escapeHtml(s)}</span>`).join('')
          : `<span class="specialty-tag specialty-tag-muted">${t('no_specialties')}</span>`}
      </div>
      <span class="clinic-card-cta">${t('book_now')}</span>
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
