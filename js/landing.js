// ============================================
// دعم اللغتين (عربي/إنجليزي)
// ============================================
const translations = {
  ar: {
    nav_login: 'تسجيل الدخول',
    search_placeholder: 'دوّر على تخصص أو اسم عيادة...',
    spec_all: 'الكل',
    spec_dental: 'أسنان',
    spec_derma: 'جلدية',
    spec_peds: 'أطفال',
    spec_internal: 'باطنية',
    spec_eye: 'عيون',
    spec_ortho: 'عظام',
    section_clinics: 'العيادات',
    section_doctors: 'الأطباء',
    view_all: 'عرض الكل',
    view_less: 'عرض أقل',
    loading: 'جاري التحميل...',
    cta_title: 'جاهز تحجز موعدك؟',
    cta_sub: 'سجّل حساب مجاني كمريض، أو سجّل عيادتك عشان تستقبل حجوزات جديدة',
    cta_btn: 'ابدأ الآن',
    footer_text: '© موعد — نظام حجز مواعيد العيادات',
    search_results: (parts) => `نتائج البحث: ${parts.join(' • ')}`,
    results_count: (docs, clinics) => `${docs} طبيب • ${clinics} عيادة`,
    no_doctors_match: 'ما فيه أطباء مطابقين',
    no_clinics_match: 'ما فيه عيادات مطابقة، جرب تخصص أو كلمة بحث ثانية',
    load_error: 'تعذر تحميل البيانات حالياً',
    doctor_count: (n) => `${n} ${n === 1 ? 'طبيب' : 'أطباء'}`,
  },
  en: {
    nav_login: 'Login',
    search_placeholder: 'Search by specialty or clinic name...',
    spec_all: 'All',
    spec_dental: 'Dental',
    spec_derma: 'Dermatology',
    spec_peds: 'Pediatrics',
    spec_internal: 'Internal Medicine',
    spec_eye: 'Ophthalmology',
    spec_ortho: 'Orthopedics',
    section_clinics: 'Clinics',
    section_doctors: 'Doctors',
    view_all: 'View All',
    view_less: 'View Less',
    loading: 'Loading...',
    cta_title: 'Ready to book your appointment?',
    cta_sub: 'Create a free patient account, or register your clinic to start receiving bookings',
    cta_btn: 'Get Started',
    footer_text: '© Mawid — Clinic Appointment Booking System',
    search_results: (parts) => `Search results: ${parts.join(' • ')}`,
    results_count: (docs, clinics) => `${docs} doctors • ${clinics} clinics`,
    no_doctors_match: 'No matching doctors',
    no_clinics_match: 'No matching clinics, try a different specialty or search term',
    load_error: 'Could not load data right now',
    doctor_count: (n) => `${n} ${n === 1 ? 'doctor' : 'doctors'}`,
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

  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.dataset.i18n;
    if (translations[lang][key]) el.textContent = translations[lang][key];
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    const key = el.dataset.i18nPlaceholder;
    if (translations[lang][key]) el.placeholder = translations[lang][key];
  });
}

document.getElementById('lang-toggle-btn').addEventListener('click', async () => {
  applyLanguage(currentLang === 'ar' ? 'en' : 'ar');
  await loadSpecialtiesBar();
  renderSpecialtyCounts();
  renderDirectory();
});

// ============================================
// تحميل العيادات الفعّالة والأطباء (قراءة عامة، بدون تسجيل دخول)
// ============================================
let allClinics = [];
let allDoctors = [];
let activeSpecialty = '';
let searchQuery = '';
let showAllClinics = false;
let showAllDoctors = false;
const CAROUSEL_CAP = 10;

let SPECIALTIES = []; // تُحمَّل ديناميكياً من مجموعة specialties بقاعدة البيانات

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

    await loadSpecialtiesBar();
    renderSpecialtyCounts();
    renderDirectory();
  } catch (err) {
    console.error('initLanding error:', err);
    const errorMsg = `<p class="empty-state">${t('load_error')}</p>`;
    document.getElementById('doctors-carousel-wrap').innerHTML = errorMsg;
    document.getElementById('clinics-carousel-wrap').innerHTML = errorMsg;
  }

  loadAdsCarousel();
}

// يجيب التخصصات من لوحة الأدمن ويبني أزرارها بعد زر "الكل" الثابت
async function loadSpecialtiesBar() {
  try {
    const snap = await db.collection('specialties').get();
    const specialties = snap.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .sort((a, b) => (a.order || 0) - (b.order || 0));

    SPECIALTIES = specialties.map((s) => s.name);

    const bar = document.getElementById('specialty-filter-bar');
    // نحذف كل شي عدا زر "الكل" الأول، ونبني الباقي من جديد
    bar.querySelectorAll('.specialty-pill:not([data-specialty=""])').forEach((el) => el.remove());

    specialties.forEach((s) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'specialty-pill';
      if (s.name === activeSpecialty) btn.classList.add('active');
      btn.dataset.specialty = s.name; // نحتفظ بالاسم العربي دايماً كقيمة فلترة (يطابق بيانات الأطباء)
      const displayName = (currentLang === 'en' && s.nameEn) ? s.nameEn : s.name;
      btn.innerHTML = `
        <span class="pill-circle">${escapeHtml(s.icon)}</span>
        <span class="pill-label">${escapeHtml(displayName)}<span class="pill-count" data-count-for="${escapeHtml(s.name)}"></span></span>
      `;
      bar.appendChild(btn);
    });

    // زر "الكل" يفعّل بس لو ما فيه تخصص مفعّل حالياً
    const allBtn = bar.querySelector('.specialty-pill[data-specialty=""]');
    if (allBtn) allBtn.classList.toggle('active', !activeSpecialty);

    bindSpecialtyPillClicks();
  } catch (err) {
    console.error('loadSpecialtiesBar error:', err);
  }
}

// ============================================
// شريط الإعلانات المتحرك (يتحكم فيه الأدمن)
// ============================================
let adSlideIndex = 0;
let adRotateTimer = null;

async function loadAdsCarousel() {
  const wrap = document.getElementById('ads-carousel-wrap');
  try {
    const snap = await db.collection('ads').get();
    const ads = snap.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .sort((a, b) => {
        if (!a.createdAt || !b.createdAt) return 0;
        return b.createdAt.toMillis() - a.createdAt.toMillis();
      });

    if (ads.length === 0) {
      wrap.classList.add('hidden');
      return;
    }

    renderAdsCarousel(ads);
    wrap.classList.remove('hidden');
  } catch (err) {
    console.error('loadAdsCarousel error:', err);
    wrap.classList.add('hidden');
  }
}

function renderAdsCarousel(ads) {
  const wrap = document.getElementById('ads-carousel-wrap');

  wrap.innerHTML = `
    <div class="ads-carousel">
      <div class="ads-track" id="ads-track">
        ${ads.map((ad) => `
          <a class="ad-slide" href="${ad.linkUrl ? escapeHtml(ad.linkUrl) : '#'}" data-has-link="${ad.linkUrl ? '1' : '0'}" target="${ad.linkUrl ? '_blank' : '_self'}" rel="noopener">
            <img src="${ad.imageUrl}" alt="${escapeHtml(ad.title || 'إعلان')}" loading="lazy">
          </a>
        `).join('')}
      </div>
      ${ads.length > 1 ? `
        <div class="ads-dots">
          ${ads.map((_, i) => `<button type="button" class="ad-dot ${i === 0 ? 'active' : ''}" data-index="${i}"></button>`).join('')}
        </div>
      ` : ''}
    </div>
  `;

  wrap.querySelectorAll('.ad-slide').forEach((slide) => {
    if (slide.dataset.hasLink === '0') {
      slide.addEventListener('click', (e) => e.preventDefault());
    }
  });

  wrap.querySelectorAll('.ad-dot').forEach((dot) => {
    dot.addEventListener('click', () => {
      goToAdSlide(Number(dot.dataset.index), ads.length);
      restartAdRotation(ads.length);
    });
  });

  adSlideIndex = 0;
  if (ads.length > 1) restartAdRotation(ads.length);
}

function goToAdSlide(index, total) {
  adSlideIndex = ((index % total) + total) % total;
  const track = document.getElementById('ads-track');
  if (track) track.style.transform = `translateX(-${adSlideIndex * 100}%)`;

  document.querySelectorAll('.ad-dot').forEach((dot, i) => {
    dot.classList.toggle('active', i === adSlideIndex);
  });
}

function restartAdRotation(total) {
  clearInterval(adRotateTimer);
  adRotateTimer = setInterval(() => {
    goToAdSlide(adSlideIndex + 1, total);
  }, 4500);
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

function bindSpecialtyPillClicks() {
  document.querySelectorAll('.specialty-pill').forEach((pill) => {
    pill.addEventListener('click', () => {
      activeSpecialty = pill.dataset.specialty;
      document.querySelectorAll('.specialty-pill').forEach((p) => p.classList.remove('active'));
      pill.classList.add('active');
      renderDirectory();
    });
  });
}

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
  const filteredClinics = getFilteredClinics();
  const filteredClinicIds = new Set(filteredClinics.map((c) => c.id));
  const filteredDoctors = allDoctors.filter((d) => filteredClinicIds.has(d.clinicId));

  const headerEl = document.getElementById('directory-header');
  const titleEl = document.getElementById('directory-title');
  const hintEl = document.getElementById('directory-hint');

  if (activeSpecialty || searchQuery) {
    const parts = [];
    if (searchQuery) parts.push(`"${searchQuery}"`);
    if (activeSpecialty) parts.push(activeSpecialty);
    titleEl.textContent = t('search_results', parts);
    hintEl.textContent = t('results_count', filteredDoctors.length, filteredClinics.length);
    headerEl.classList.remove('hidden');
  } else {
    headerEl.classList.add('hidden');
  }

  renderDoctorsCarousel(filteredDoctors);
  renderClinicsCarousel(filteredClinics);
}

function renderDoctorsCarousel(doctors) {
  const wrap = document.getElementById('doctors-carousel-wrap');

  if (doctors.length === 0) {
    wrap.innerHTML = `<p class="empty-state">${t('no_doctors_match')}</p>`;
    updateViewAllButton('doctors-carousel-wrap', 0, showAllDoctors);
    return;
  }

  const display = showAllDoctors ? doctors : doctors.slice(0, CAROUSEL_CAP);
  wrap.innerHTML = `<div class="carousel-track">${display.map((d) => renderDoctorMiniCard(d)).join('')}</div>`;
  setupAutoScroll('doctors-carousel-wrap');
  updateViewAllButton('doctors-carousel-wrap', doctors.length, showAllDoctors);
}

function renderDoctorMiniCard(d) {
  const clinic = allClinics.find((c) => c.id === d.clinicId);
  const clinicName = clinic ? clinic.name : '';
  const avatarStyle = d.photoUrl
    ? `background-image:url('${d.photoUrl}')`
    : `background:${avatarColor(d.name)}`;

  return `
    <a href="login.html" class="doctor-card-mini">
      <div class="doctor-photo-circle" style="${avatarStyle}">${d.photoUrl ? '' : escapeHtml(initials(d.name))}</div>
      <p class="dc-name">${escapeHtml(d.name)}</p>
      <p class="dc-specialty">${escapeHtml(d.specialty || '')}</p>
      <p class="dc-clinic">${escapeHtml(clinicName)}</p>
    </a>
  `;
}

function renderClinicsCarousel(clinics) {
  const wrap = document.getElementById('clinics-carousel-wrap');

  if (clinics.length === 0) {
    wrap.innerHTML = `<p class="empty-state">${t('no_clinics_match')}</p>`;
    updateViewAllButton('clinics-carousel-wrap', 0, showAllClinics);
    return;
  }

  const display = showAllClinics ? clinics : clinics.slice(0, CAROUSEL_CAP);
  wrap.innerHTML = `<div class="carousel-track">${display.map((c) => renderClinicMiniCard(c)).join('')}</div>`;
  setupAutoScroll('clinics-carousel-wrap');
  updateViewAllButton('clinics-carousel-wrap', clinics.length, showAllClinics);
}

function renderClinicMiniCard(c) {
  const doctors = allDoctors.filter((d) => d.clinicId === c.id);
  const specialties = [...new Set(doctors.map((d) => d.specialty).filter(Boolean))];
  const subText = specialties.length
    ? specialties.slice(0, 2).join('، ')
    : t('doctor_count', doctors.length);

  const logoStyle = c.logoUrl
    ? `background-image:url('${c.logoUrl}')`
    : `background:${avatarColor(c.name)}`;

  return `
    <div class="clinic-card-mini">
      <a href="clinic-profile.html?id=${c.id}" class="clinic-card-mini-link">
        <div class="clinic-logo-circle" style="${logoStyle}">${c.logoUrl ? '' : escapeHtml(initials(c.name))}</div>
        <p class="cc-name">${escapeHtml(c.name)}</p>
        <p class="cc-sub">${escapeHtml(subText)}</p>
        ${c.address ? `<p class="cc-address"><svg class="cc-address-icon" viewBox="0 0 24 24" width="11" height="11"><path fill="currentColor" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"/></svg>${escapeHtml(c.address)}</p>` : ''}
      </a>
    </div>
  `;
}

// ============================================
// أيقونة البحث: تظهر/تخفي مربع البحث عند الضغط
// ============================================
const searchToggleBtn = document.getElementById('search-toggle-btn');
const navSearchWrap = document.getElementById('nav-search-wrap');
if (searchToggleBtn && navSearchWrap) {
  searchToggleBtn.addEventListener('click', () => {
    navSearchWrap.classList.toggle('hidden');
    if (!navSearchWrap.classList.contains('hidden')) {
      document.getElementById('hero-search-input').focus();
    }
  });
}

// ============================================
// تمرير تلقائي مستمر للعيادات والأطباء (يتوقف عند اللمس/التمرير اليدوي ويرجع بعدها)
// ============================================
const autoScrollTimers = {};

function setupAutoScroll(wrapId) {
  clearInterval(autoScrollTimers[wrapId]);

  const track = document.querySelector(`#${wrapId} .carousel-track`);
  if (!track) return;

  // ما نفعّل التمرير التلقائي إلا لو فيه محتوى أطول من عرض الشاشة فعلاً
  if (track.scrollWidth <= track.clientWidth + 10) return;

  let resumeTimeout = null;

  const step = () => {
    // بالـ RTL الأصلي، أقصى تمرير (آخر عنصر) يوصله scrollLeft عند قيمة سالبة تقارب -(scrollWidth - clientWidth)
    const maxScroll = track.scrollWidth - track.clientWidth;
    const atEnd = Math.abs(track.scrollLeft) >= maxScroll - 2;

    if (atEnd) {
      track.scrollTo({ left: 0, behavior: 'smooth' });
    } else {
      track.scrollBy({ left: -1, behavior: 'auto' });
    }
  };

  autoScrollTimers[wrapId] = setInterval(step, 30);

  const pause = () => clearInterval(autoScrollTimers[wrapId]);
  const resume = () => {
    clearTimeout(resumeTimeout);
    resumeTimeout = setTimeout(() => {
      clearInterval(autoScrollTimers[wrapId]);
      autoScrollTimers[wrapId] = setInterval(step, 30);
    }, 2000);
  };

  track.addEventListener('mouseenter', pause);
  track.addEventListener('mouseleave', resume);
  track.addEventListener('touchstart', pause, { passive: true });
  track.addEventListener('touchend', resume);
}

// ============================================
// زر "عرض الكل" - يمسح أي فلتر مفعّل (بحث/تخصص) ويعرض القائمة كاملة
// ============================================
document.querySelectorAll('.view-all-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    if (btn.dataset.target === 'clinics-carousel-wrap') {
      showAllClinics = !showAllClinics;
    } else if (btn.dataset.target === 'doctors-carousel-wrap') {
      showAllDoctors = !showAllDoctors;
    }
    renderDirectory();
  });
});

// يظهر/يخفي زر "عرض الكل" حسب العدد الفعلي، ويبدّل نصه بين "عرض الكل" و"عرض أقل"
function updateViewAllButton(wrapId, total, showAll) {
  const btn = document.querySelector(`.view-all-btn[data-target="${wrapId}"]`);
  if (!btn) return;

  if (total <= CAROUSEL_CAP) {
    btn.classList.add('hidden');
    return;
  }

  btn.classList.remove('hidden');
  btn.textContent = showAll ? t('view_less') : t('view_all');
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
