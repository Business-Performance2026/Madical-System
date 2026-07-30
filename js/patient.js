// ============================================
// حماية الصفحة: لازم مريض مسجّل دخول وحسابه فعّال
// ============================================
let currentUid = null;
let patientName = '';
let patientPhone = '';

const DAYS = [
  { key: 'sunday', label: 'الأحد' },
  { key: 'monday', label: 'الاثنين' },
  { key: 'tuesday', label: 'الثلاثاء' },
  { key: 'wednesday', label: 'الأربعاء' },
  { key: 'thursday', label: 'الخميس' },
  { key: 'friday', label: 'الجمعة' },
  { key: 'saturday', label: 'السبت' },
];

const SLOT_MINUTES = 20; // مدة كل موعد

auth.onAuthStateChanged(async (user) => {
  if (!user) {
    window.location.href = '../index.html';
    return;
  }

  const userDoc = await db.collection('users').doc(user.uid).get();

  if (!userDoc.exists || userDoc.data().role !== 'patient' || userDoc.data().status !== 'active') {
    await auth.signOut();
    window.location.href = '../index.html';
    return;
  }

  currentUid = user.uid;
  patientName = userDoc.data().name || 'مريض';
  patientPhone = userDoc.data().phone || '';
  document.getElementById('patient-name').textContent = patientName;

  loadClinics();
  loadMyBookings();
});

document.getElementById('logout-btn').addEventListener('click', async () => {
  await auth.signOut();
  window.location.href = '../index.html';
});

// ============================================
// حالة خطوات الحجز
// ============================================
let allClinics = [];
let clinicDoctors = [];
let clinicSpecialtiesMap = {};
let selectedClinic = null;
let selectedDoctor = null;
let selectedDate = '';
let selectedTime = '';

async function loadClinics() {
  try {
    const snap = await db.collection('users')
      .where('role', '==', 'clinic')
      .where('status', '==', 'active')
      .get();

    allClinics = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

    // نجيب كل الأطباء عشان نعرض تخصصات كل عيادة بدل الإيميل (مجموعة doctors قراءتها عامة)
    const clinicIds = new Set(allClinics.map((c) => c.id));
    const doctorsSnap = await db.collection('doctors').get();

    clinicSpecialtiesMap = {};
    doctorsSnap.docs.forEach((doc) => {
      const d = doc.data();
      if (!clinicIds.has(d.clinicId) || !d.specialty) return;
      if (!clinicSpecialtiesMap[d.clinicId]) clinicSpecialtiesMap[d.clinicId] = new Set();
      clinicSpecialtiesMap[d.clinicId].add(d.specialty);
    });

    renderClinicsStep();
  } catch (err) {
    console.error('loadClinics error:', err);
    document.getElementById('booking-steps').innerHTML =
      '<p class="empty-state">حدث خطأ أثناء تحميل العيادات، حدّث الصفحة وحاول مرة أخرى</p>';
  }
}

// ============================================
// الخطوة 1: اختيار العيادة
// ============================================
function renderClinicsStep() {
  const wrap = document.getElementById('booking-steps');

  wrap.innerHTML = `
    <span class="step-hint">الخطوة 1 من 3: اختر العيادة</span>
    <input type="text" id="clinic-search" class="search-box" placeholder="ابحث باسم العيادة...">
    <div class="choice-list" id="clinics-list"></div>
  `;

  document.getElementById('clinic-search').addEventListener('input', (e) => {
    updateClinicsList(e.target.value.trim());
  });

  updateClinicsList('');
}

function updateClinicsList(query) {
  let list = allClinics;
  if (query) list = list.filter((c) => c.name && c.name.includes(query));

  const listEl = document.getElementById('clinics-list');

  if (list.length === 0) {
    listEl.innerHTML = `<p class="empty-state">${allClinics.length === 0 ? 'ما فيه عيادات فعّالة حالياً' : 'ما فيه عيادات مطابقة'}</p>`;
    return;
  }

  listEl.innerHTML = list.map((c) => {
    const specialties = clinicSpecialtiesMap[c.id] ? [...clinicSpecialtiesMap[c.id]] : [];
    const subText = specialties.length ? specialties.join('، ') : 'ما تم إضافة تخصصات بعد';
    return `
      <div class="choice-card" data-id="${c.id}">
        <div>
          <p class="choice-title">${escapeHtml(c.name)}</p>
          <p class="choice-sub">${escapeHtml(subText)}</p>
        </div>
        <span class="choice-arrow">‹</span>
      </div>
    `;
  }).join('');

  listEl.querySelectorAll('.choice-card').forEach((card) => {
    card.addEventListener('click', () => {
      selectedClinic = list.find((c) => c.id === card.dataset.id);
      goToDoctorsStep();
    });
  });
}

// ============================================
// الخطوة 2: اختيار الطبيب
// ============================================
async function goToDoctorsStep() {
  const wrap = document.getElementById('booking-steps');
  wrap.innerHTML = '<p class="loading-state">جاري تحميل الأطباء...</p>';

  const snap = await db.collection('doctors').where('clinicId', '==', selectedClinic.id).get();
  clinicDoctors = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

  renderDoctorsStep();
}

function renderDoctorsStep() {
  const wrap = document.getElementById('booking-steps');

  wrap.innerHTML = `
    <span class="step-hint">الخطوة 2 من 3: اختر الطبيب — ${escapeHtml(selectedClinic.name)}</span>
    <button type="button" class="btn-outline" id="back-to-clinics" style="margin-bottom:16px;">‹ رجوع لاختيار العيادة</button>
    <div class="choice-list" id="doctors-list"></div>
  `;

  document.getElementById('back-to-clinics').addEventListener('click', renderClinicsStep);

  const listEl = document.getElementById('doctors-list');
  if (clinicDoctors.length === 0) {
    listEl.innerHTML = '<p class="empty-state">هذي العيادة ما أضافت أطباء بعد</p>';
    return;
  }

  listEl.innerHTML = clinicDoctors.map((d) => `
    <div class="choice-card" data-id="${d.id}">
      <div>
        <p class="choice-title">${escapeHtml(d.name)}</p>
        <p class="choice-sub">${escapeHtml(d.specialty)}</p>
      </div>
      <span class="choice-arrow">‹</span>
    </div>
  `).join('');

  listEl.querySelectorAll('.choice-card').forEach((card) => {
    card.addEventListener('click', () => {
      selectedDoctor = clinicDoctors.find((d) => d.id === card.dataset.id);
      selectedDate = '';
      selectedTime = '';
      renderDateStep();
    });
  });
}

// ============================================
// الخطوة 3: اختيار التاريخ والوقت المتاح
// ============================================
function renderDateStep() {
  const wrap = document.getElementById('booking-steps');
  const todayStr = todayISO();
  const maxDate = addDaysISO(todayStr, 30);

  wrap.innerHTML = `
    <span class="step-hint">الخطوة 3 من 3: اختر الموعد — د. ${escapeHtml(selectedDoctor.name)}</span>
    <button type="button" class="btn-outline" id="back-to-doctors" style="margin-bottom:16px;">‹ رجوع لاختيار الطبيب</button>
    <div class="field">
      <label for="booking-date">اختر اليوم</label>
      <input type="date" id="booking-date" class="date-input" min="${todayStr}" max="${maxDate}">
    </div>
    <div id="slots-wrap"></div>
    <div id="confirm-wrap"></div>
  `;

  document.getElementById('back-to-doctors').addEventListener('click', renderDoctorsStep);
  document.getElementById('booking-date').addEventListener('change', async (e) => {
    selectedDate = e.target.value;
    selectedTime = '';
    document.getElementById('confirm-wrap').innerHTML = '';
    await renderAvailableSlots();
  });
}

async function renderAvailableSlots() {
  const slotsWrap = document.getElementById('slots-wrap');
  slotsWrap.innerHTML = '<p class="loading-state">جاري تحميل الأوقات المتاحة...</p>';

  // نطابق أوقات العمل بالتاريخ المحدد فعلياً (النظام الجديد)،
  // مع بقاء التوافق مع أي أوقات قديمة كانت محفوظة بيوم أسبوع متكرر
  const dayKey = DAYS[new Date(selectedDate + 'T00:00:00').getDay()].key;
  const hoursForDay = (selectedDoctor.workingHours || []).filter(
    (h) => h.date === selectedDate || (!h.date && h.day === dayKey)
  );

  if (hoursForDay.length === 0) {
    slotsWrap.innerHTML = '<p class="warning-text">⚠️ الطبيب ما عنده دوام باليوم المختار، جرّب يوم ثاني</p>';
    return;
  }

  // نجيب أوقات هذا الطبيب المقفولة بهذا اليوم من مجموعة lockedSlots
  // (بدون قراءة حجوزات مرضى ثانين مباشرة - محمية بقواعد الأمان)
  const lockedSnap = await db.collection('lockedSlots')
    .where('doctorId', '==', selectedDoctor.id)
    .where('date', '==', selectedDate)
    .get();

  const bookedTimes = new Set(lockedSnap.docs.map((doc) => doc.data().time));

  const allSlots = hoursForDay.flatMap((h) => generateSlots(h.start, h.end));
  const availableSlots = [...new Set(allSlots)].filter((t) => !bookedTimes.has(t)).sort();

  if (availableSlots.length === 0) {
    slotsWrap.innerHTML = '<p class="warning-text">⚠️ كل الأوقات محجوزة باليوم المختار، جرّب يوم ثاني</p>';
    return;
  }

  slotsWrap.innerHTML = `<div class="slot-grid">${availableSlots.map((t) => `
    <button type="button" class="slot-btn" data-time="${t}">${t}</button>
  `).join('')}</div>`;

  slotsWrap.querySelectorAll('.slot-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      slotsWrap.querySelectorAll('.slot-btn').forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedTime = btn.dataset.time;
      renderConfirmBox();
    });
  });
}

function renderConfirmBox() {
  const confirmWrap = document.getElementById('confirm-wrap');
  confirmWrap.innerHTML = `
    <div class="confirm-box">
      <p>تأكيد حجز موعد يوم ${selectedDate} الساعة ${selectedTime} مع د. ${escapeHtml(selectedDoctor.name)}؟</p>
      <button type="button" class="btn-primary" id="confirm-booking-btn">إرسال طلب الحجز</button>
    </div>
  `;
  document.getElementById('confirm-booking-btn').addEventListener('click', submitBooking);
}

async function submitBooking() {
  const btn = document.getElementById('confirm-booking-btn');
  btn.disabled = true;
  btn.textContent = 'جاري الإرسال...';

  try {
    const docRef = await db.collection('bookings').add({
      clinicId: selectedClinic.id,
      doctorId: selectedDoctor.id,
      doctorName: selectedDoctor.name,
      patientId: currentUid,
      patientName: patientName,
      patientPhone: patientPhone,
      date: selectedDate,
      time: selectedTime,
      status: 'pending',
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });

    const code = bookingNumber(docRef.id);

    renderClinicsStep();
    loadMyBookings();

    showModal(`
      <h3>✅ تم إرسال طلب الحجز</h3>
      <p>رقم حجزك</p>
      <p class="modal-code">${code}</p>
      <p class="cell-sub">بتوصلك حالته بعد ما تراجعه العيادة، وتقدر تتابعها من قسم "مواعيدي الحالية" تحت</p>
      <button type="button" class="btn-primary" id="modal-ok-btn">تم</button>
    `);
    document.getElementById('modal-ok-btn').addEventListener('click', closeModal);
  } catch (err) {
    alert('حدث خطأ أثناء إرسال الطلب، حاول مرة أخرى');
    btn.disabled = false;
    btn.textContent = 'إرسال طلب الحجز';
  }
}

// ============================================
// نافذة منبثقة (Modal) عامة
// ============================================
function showModal(html) {
  const root = document.getElementById('modal-root');
  root.innerHTML = `<div class="modal-overlay" id="modal-overlay"><div class="modal-box">${html}</div></div>`;
  document.getElementById('modal-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'modal-overlay') closeModal();
  });
}

function closeModal() {
  document.getElementById('modal-root').innerHTML = '';
}

// ============================================
// مواعيدي
// ============================================
let cachedMyBookings = [];

async function loadMyBookings() {
  const snap = await db.collection('bookings').where('patientId', '==', currentUid).get();
  const bookings = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  cachedMyBookings = bookings;

  const todayStr = todayISO();
  const upcoming = bookings
    .filter((b) => b.status !== 'rejected' && b.status !== 'cancelled' && b.date >= todayStr)
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const past = bookings
    .filter((b) => b.status === 'rejected' || b.status === 'cancelled' || b.date < todayStr)
    .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));

  renderBookingsList('upcoming-appts-wrap', upcoming, 'ما فيه مواعيد قادمة حالياً', true);
  renderBookingsList('past-appts-wrap', past, 'ما فيه مواعيد سابقة', false);
}

function renderBookingsList(elementId, bookings, emptyText, allowCancel) {
  const wrap = document.getElementById(elementId);

  if (bookings.length === 0) {
    wrap.innerHTML = `<p class="empty-state">${emptyText}</p>`;
    return;
  }

  wrap.innerHTML = bookings.map((b) => `
    <div class="appt-card">
      <div>
        <p class="appt-main">د. ${escapeHtml(b.doctorName)}</p>
        <p class="appt-sub">${b.date} — ${b.time} • رقم الحجز: ${bookingNumber(b.id)}</p>
      </div>
      <div class="appt-actions">
        ${bookingStatusBadge(b.status)}
        ${allowCancel && (b.status === 'pending' || b.status === 'accepted')
          ? `<button type="button" class="btn-xs delete" data-action="cancel" data-id="${b.id}">إلغاء الحجز</button>`
          : ''}
      </div>
    </div>
  `).join('');

  wrap.querySelectorAll('[data-action="cancel"]').forEach((btn) => {
    btn.addEventListener('click', () => cancelBooking(btn.dataset.id));
  });
}

async function cancelBooking(bookingId) {
  const sure = confirm('متأكد إنك تبي تلغي هذا الحجز؟');
  if (!sure) return;

  const booking = cachedMyBookings.find((b) => b.id === bookingId);

  try {
    await db.collection('bookings').doc(bookingId).update({ status: 'cancelled' });

    // لو كان الحجز مقبول (أي وقته مقفول)، نحرر الوقت بحذف قفله
    if (booking && booking.status === 'accepted') {
      await db.collection('lockedSlots').doc(buildLockId(booking.doctorId, booking.date, booking.time)).delete();
    }

    loadMyBookings();
  } catch (err) {
    console.error('cancelBooking error:', err);
    alert('تعذر إلغاء الحجز، حاول مرة أخرى');
  }
}

function buildLockId(doctorId, date, time) {
  return `${doctorId}_${date}_${time.replace(':', '')}`;
}

// ============================================
// أدوات مساعدة
// ============================================
function generateSlots(start, end) {
  const slots = [];
  let [h, m] = start.split(':').map(Number);
  const [endH, endM] = end.split(':').map(Number);
  const endTotal = endH * 60 + endM;

  let current = h * 60 + m;
  while (current + SLOT_MINUTES <= endTotal) {
    const hh = String(Math.floor(current / 60)).padStart(2, '0');
    const mm = String(current % 60).padStart(2, '0');
    slots.push(`${hh}:${mm}`);
    current += SLOT_MINUTES;
  }
  return slots;
}

function bookingStatusBadge(status) {
  const labels = { pending: 'قيد الانتظار', accepted: 'مقبول', rejected: 'مرفوض', cancelled: 'ملغى' };
  const cls = { pending: 'badge-pending', accepted: 'badge-active', rejected: 'badge-rejected', cancelled: 'badge-cancelled' };
  return `<span class="badge ${cls[status] || ''}">${labels[status] || status}</span>`;
}

function bookingNumber(id) {
  return id.slice(-6).toUpperCase();
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysISO(iso, days) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ============================================
// تبويبات فوق لتبديل الأقسام
// ============================================
function initPageTabs() {
  const tabButtons = document.querySelectorAll('.page-tabs button');
  const panels = document.querySelectorAll('.tab-panel');

  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      tabButtons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      panels.forEach((p) => p.classList.toggle('hidden', p.dataset.panel !== btn.dataset.tab));
    });
  });
}

// يفعّل تبويب معيّن برمجياً (يُستخدم مثلاً عند الضغط على تنبيه يخص قسم ثاني)
function switchToTab(tabName) {
  const btn = document.querySelector(`.page-tabs button[data-tab="${tabName}"]`);
  if (btn) btn.click();
}

initPageTabs();
