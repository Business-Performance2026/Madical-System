// ============================================
// أيقونات SVG حقيقية (نفس المستخدمة بباقي التطبيق)
// ============================================
const ICON_WHATSAPP = '<svg viewBox="0 0 24 24" width="18" height="18"><path fill="#25D366" d="M17.6 6.32A7.85 7.85 0 0 0 12.05 4a7.94 7.94 0 0 0-6.9 11.9L4 20l4.2-1.1a7.9 7.9 0 0 0 3.83 1h.02a7.94 7.94 0 0 0 5.55-13.58zM12.05 18.5a6.6 6.6 0 0 1-3.36-.92l-.24-.14-2.5.66.67-2.44-.16-.25a6.6 6.6 0 1 1 12.24-3.51 6.56 6.56 0 0 1-6.65 6.6zm3.6-4.93c-.2-.1-1.17-.58-1.35-.64s-.31-.1-.44.1-.51.64-.62.77-.23.15-.42.05a5.4 5.4 0 0 1-1.6-.98 5.98 5.98 0 0 1-1.1-1.37c-.12-.2 0-.3.09-.4s.2-.23.3-.35.13-.2.2-.33.03-.25 0-.35-.44-1.06-.6-1.45c-.16-.38-.32-.33-.44-.33h-.38a.72.72 0 0 0-.52.24 2.2 2.2 0 0 0-.68 1.63c0 .96.7 1.9.8 2.03s1.37 2.1 3.33 2.94c.47.2.83.32 1.11.41.47.15.9.13 1.24.08.38-.06 1.17-.48 1.34-.94s.17-.86.12-.94-.18-.13-.38-.23z"/></svg>';

const ICON_INSTAGRAM = '<svg viewBox="0 0 24 24" width="18" height="18"><path fill="#C13584" d="M12 2.16c3.2 0 3.58 0 4.85.07 1.17.05 1.8.24 2.23.41.55.21.95.47 1.37.89.42.42.68.82.89 1.37.17.42.36 1.06.41 2.23.07 1.27.07 1.65.07 4.85s0 3.58-.07 4.85c-.05 1.17-.24 1.8-.41 2.23a3.7 3.7 0 0 1-.89 1.37 3.7 3.7 0 0 1-1.37.89c-.42.17-1.06.36-2.23.41-1.27.07-1.65.07-4.85.07s-3.58 0-4.85-.07c-1.17-.05-1.8-.24-2.23-.41a3.7 3.7 0 0 1-1.37-.89 3.7 3.7 0 0 1-.89-1.37c-.17-.42-.36-1.06-.41-2.23C2.16 15.58 2.16 15.2 2.16 12s0-3.58.07-4.85c.05-1.17.24-1.8.41-2.23.21-.55.47-.95.89-1.37.42-.42.82-.68 1.37-.89.42-.17 1.06-.36 2.23-.41C8.42 2.16 8.8 2.16 12 2.16zm0 1.89c-3.15 0-3.5 0-4.73.07-1.02.05-1.58.21-1.94.35-.49.19-.84.42-1.21.79-.37.37-.6.72-.79 1.21-.14.36-.3.92-.35 1.94-.07 1.24-.07 1.58-.07 4.73s0 3.5.07 4.73c.05 1.02.21 1.58.35 1.94.19.49.42.84.79 1.21.37.37.72.6 1.21.79.36.14.92.3 1.94.35 1.24.07 1.58.07 4.73.07s3.5 0 4.73-.07c1.02-.05 1.58-.21 1.94-.35.49-.19.84-.42 1.21-.79.37-.37.6-.72.79-1.21.14-.36.3-.92.35-1.94.07-1.24.07-1.58.07-4.73s0-3.5-.07-4.73c-.05-1.02-.21-1.58-.35-1.94a3.28 3.28 0 0 0-.79-1.21 3.28 3.28 0 0 0-1.21-.79c-.36-.14-.92-.3-1.94-.35C15.5 4.05 15.15 4.05 12 4.05zm0 3.24a4.7 4.7 0 1 1 0 9.4 4.7 4.7 0 0 1 0-9.4zm0 1.89a2.82 2.82 0 1 0 0 5.64 2.82 2.82 0 0 0 0-5.64zm5.88-2.07a1.1 1.1 0 1 1-2.2 0 1.1 1.1 0 0 1 2.2 0z"/></svg>';

// ============================================
// تحميل بيانات العيادة من رقم المعرّف بالرابط (?id=)
// ============================================
let cachedClinic = null;
let cachedDoctors = [];
let cachedRatingsMap = {};

async function initClinicProfile() {
  const clinicId = new URLSearchParams(window.location.search).get('id');
  const loadingEl = document.getElementById('profile-loading');
  const contentEl = document.getElementById('profile-content');

  if (!clinicId) {
    loadingEl.innerHTML = `<p class="empty-state">${t('profile_invalid_link')}</p>`;
    return;
  }

  try {
    const clinicDoc = await db.collection('users').doc(clinicId).get();

    if (!clinicDoc.exists || clinicDoc.data().role !== 'clinic' || clinicDoc.data().status !== 'active') {
      loadingEl.innerHTML = `<p class="empty-state">${t('profile_clinic_not_found')}</p>`;
      return;
    }

    const clinic = { id: clinicDoc.id, ...clinicDoc.data() };

    const [doctorsSnap, reviewsSnap] = await Promise.all([
      db.collection('doctors').where('clinicId', '==', clinicId).get(),
      db.collection('reviews').where('clinicId', '==', clinicId).get(),
    ]);

    const doctors = doctorsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

    const ratingsMap = {};
    reviewsSnap.docs.forEach((doc) => {
      const r = doc.data();
      if (!ratingsMap[r.doctorId]) ratingsMap[r.doctorId] = { sum: 0, count: 0 };
      ratingsMap[r.doctorId].sum += r.rating;
      ratingsMap[r.doctorId].count += 1;
    });

    cachedClinic = clinic;
    cachedDoctors = doctors;
    cachedRatingsMap = ratingsMap;

    document.getElementById('page-title').textContent = `موعد | ${clinic.name}`;
    document.getElementById('book-now-nav-btn').href = `login.html?clinic=${clinicId}`;

    renderProfile(clinic, doctors, ratingsMap);
    loadingEl.classList.add('hidden');
    contentEl.classList.remove('hidden');
  } catch (err) {
    console.error('initClinicProfile error:', err);
    loadingEl.innerHTML = `<p class="empty-state">${t('profile_load_error')}</p>`;
  }
}

// لما تتبدّل اللغة، نعيد رسم محتوى الصفحة من البيانات المحفوظة بدون إعادة تحميل من القاعدة
function onLanguageChanged() {
  if (cachedClinic) renderProfile(cachedClinic, cachedDoctors, cachedRatingsMap);
}

function renderProfile(clinic, doctors, ratingsMap) {
  const contentEl = document.getElementById('profile-content');

  const logoStyle = clinic.logoUrl
    ? `background-image:url('${clinic.logoUrl}')`
    : `background:${avatarColor(clinic.name)}`;

  const specialties = [...new Set(doctors.map((d) => d.specialty).filter(Boolean))];

  contentEl.innerHTML = `
    <div class="profile-header-card">
      <div class="profile-logo" style="${logoStyle}">${clinic.logoUrl ? '' : escapeHtml(initials(clinic.name))}</div>
      <div class="profile-header-info">
        <h1 class="profile-clinic-name">${escapeHtml(clinic.name)}</h1>
        ${clinic.address ? `<p class="profile-address">📍 ${escapeHtml(clinic.address)}</p>` : ''}
        ${specialties.length ? `
          <div class="profile-specialty-tags">
            ${specialties.map((s) => `<span class="specialty-tag">${escapeHtml(s)}</span>`).join('')}
          </div>
        ` : ''}
      </div>
    </div>

    ${buildMapBlock(clinic)}

    ${(clinic.whatsapp || clinic.instagram) ? `
      <div class="profile-contact-row">
        ${clinic.whatsapp ? `
          <a class="profile-contact-btn" href="https://wa.me/${sanitizePhone(clinic.whatsapp)}" target="_blank" rel="noopener">
            ${ICON_WHATSAPP} ${t('profile_whatsapp')}
          </a>
        ` : ''}
        ${clinic.instagram ? `
          <a class="profile-contact-btn" href="${escapeHtml(instagramUrl(clinic.instagram))}" target="_blank" rel="noopener">
            ${ICON_INSTAGRAM} ${t('profile_instagram')}
          </a>
        ` : ''}
      </div>
    ` : ''}

    <a href="login.html?clinic=${clinic.id}" class="btn-primary profile-book-btn">${t('profile_book_now')}</a>

    ${(clinic.services && clinic.services.length) ? `
      <section class="profile-block">
        <h2 class="profile-block-title">${t('profile_services_title')}</h2>
        <div class="profile-services-list">
          ${clinic.services.map((s) => `<span class="service-tag">${escapeHtml(s)}</span>`).join('')}
        </div>
      </section>
    ` : ''}

    <section class="profile-block">
      <h2 class="profile-block-title">${t('profile_doctors_title')}</h2>
      ${doctors.length === 0
        ? `<p class="empty-state">${t('profile_no_doctors')}</p>`
        : `<div class="profile-doctors-grid">${doctors.map((d) => renderDoctorCard(d, ratingsMap)).join('')}</div>`}
    </section>
  `;
}

// يبني رابط "موقع العيادة على خرائط جوجل" — يفضّل رابط الخريطة اللي حطته العيادة،
// وإلا يبني رابط بحث من العنوان النصي، وإلا ما يعرض شي
function buildMapBlock(clinic) {
  let mapUrl = null;

  if (clinic.mapsLink) {
    mapUrl = clinic.mapsLink;
  } else if (clinic.address) {
    mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(clinic.address)}`;
  }

  if (!mapUrl) return '';

  return `
    <a class="profile-directions-link" href="${escapeHtml(mapUrl)}" target="_blank" rel="noopener">
      <svg viewBox="0 0 24 24" width="18" height="18"><path fill="var(--gold-600)" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"/></svg>
      <span>${t('profile_maps_link')}</span>
    </a>
  `;
}

function renderDoctorCard(d, ratingsMap) {
  const photoStyle = d.photoUrl
    ? `background-image:url('${d.photoUrl}')`
    : `background:${avatarColor(d.name)}`;

  const ratingInfo = ratingsMap[d.id];
  const ratingText = ratingInfo
    ? t('profile_rating_summary', (ratingInfo.sum / ratingInfo.count).toFixed(1), ratingInfo.count)
    : t('profile_no_reviews');

  return `
    <div class="profile-doctor-card">
      <div class="profile-doctor-photo" style="${photoStyle}">${d.photoUrl ? '' : escapeHtml(initials(d.name))}</div>
      <p class="pd-name">${escapeHtml(d.name)}</p>
      <p class="pd-specialty">${escapeHtml(d.specialty || '')}</p>
      <p class="pd-rating">${ratingText}</p>
    </div>
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

function sanitizePhone(phone) {
  return (phone || '').replace(/[^0-9]/g, '');
}

function instagramUrl(handle) {
  if (!handle) return '#';
  if (/^https?:\/\//i.test(handle)) return handle;
  return `https://instagram.com/${handle.replace(/^@/, '')}`;
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// زر الرجوع: يرجع لنفس الصفحة اللي جاء منها المستخدم لو فيه سجل تصفّح، وإلا يرجعه للرئيسية
document.getElementById('back-btn').addEventListener('click', () => {
  if (document.referrer && document.referrer.includes(window.location.host)) {
    history.back();
  } else {
    window.location.href = 'index.html';
  }
});

initClinicProfile();
