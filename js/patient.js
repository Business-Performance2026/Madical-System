// ============================================
// حماية الصفحة: لازم مريض مسجّل دخول وحسابه فعّال
// ============================================
let currentUid = null;
let patientName = '';

const DAYS = [
  { key: 'sunday', label: 'الأحد' },
  { key: 'monday', label: 'الاثنين' },
  { key: 'tuesday', label: 'الثلاثاء' },
  { key: 'wednesday', label: 'الأربعاء' },
  { key: 'thursday', label: 'الخميس' },
  { key: 'friday', label: 'الجمعة' },
  { key: 'saturday', label: 'السبت' },
];

const SLOT_MINUTES = 30; // مدة كل موعد

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
let selectedClinic = null;
let selectedDoctor = null;
let selectedDate = '';
let selectedTime = '';

async function loadClinics() {
  const snap = await db.collection('users').where('role', '==', 'clinic').where('status', '==', 'active').get();
  allClinics = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  renderClinicsStep();
}

// ============================================
// الخطوة 1: اختيار العيادة
// ============================================
function renderClinicsStep(query = '') {
  const wrap = document.getElementById('booking-steps');

  let list = allClinics;
  if (query) list = list.filter((c) => c.name && c.name.includes(query));

  wrap.innerHTML = `
    <span class="step-hint">الخطوة 1 من 3: اختر العيادة</span>
    <input type="text" id="clinic-search" class="search-box" placeholder="ابحث باسم العيادة..." value="${escapeHtml(query)}">
    <div class="choice-list" id="clinics-list"></div>
  `;

  const listEl = document.getElementById('clinics-list');
  if (list.length === 0) {
    listEl.innerHTML = '<p class="empty-state">ما فيه عيادات مطابقة</p>';
  } else {
    listEl.innerHTML = list.map((c) => `
      <div class="choice-card" data-id="${c.id}">
        <div>
          <p class="choice-title">${escapeHtml(c.name)}</p>
          <p class="choice-sub">${escapeHtml(c.email)}</p>
        </div>
        <span class="choice-arrow">‹</span>
      </div>
    `).join('');

    listEl.querySelectorAll('.choice-card').forEach((card) => {
      card.addEventListener('click', () => {
        selectedClinic = list.find((c) => c.id === card.dataset.id);
        goToDoctorsStep();
      });
    });
  }

  document.getElementById('clinic-search').addEventListener('input', (e) => {
    renderClinicsStep(e.target.value.trim());
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

  const dayKey = DAYS[new Date(selectedDate + 'T00:00:00').getDay()].key;
  const hoursForDay = (selectedDoctor.workingHours || []).filter((h) => h.day === dayKey);

  if (hoursForDay.length === 0) {
    slotsWrap.innerHTML = '<p class="empty-state">الطبيب ما عنده دوام باليوم المختار، جرّب يوم ثاني</p>';
    return;
  }

  // نجيب الحجوزات المقبولة لنفس الطبيب ونفس اليوم عشان نستثني أوقاتها
  const bookedSnap = await db.collection('bookings')
    .where('doctorId', '==', selectedDoctor.id)
    .where('date', '==', selectedDate)
    .where('status', '==', 'accepted')
    .get();

  const bookedTimes = new Set(bookedSnap.docs.map((doc) => doc.data().time));

  const allSlots = hoursForDay.flatMap((h) => generateSlots(h.start, h.end));
  const availableSlots = [...new Set(allSlots)].filter((t) => !bookedTimes.has(t)).sort();

  if (availableSlots.length === 0) {
    slotsWrap.innerHTML = '<p class="empty-state">كل الأوقات محجوزة باليوم المختار، جرّب يوم ثاني</p>';
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
    await db.collection('bookings').add({
      clinicId: selectedClinic.id,
      doctorId: selectedDoctor.id,
      doctorName: selectedDoctor.name,
      patientId: currentUid,
      patientName: patientName,
      date: selectedDate,
      time: selectedTime,
      status: 'pending',
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });

    document.getElementById('booking-steps').innerHTML = `
      <p class="empty-state">✅ تم إرسال طلب الحجز، بتوصلك حالته بعد ما تراجعه العيادة</p>
      <button type="button" class="btn-primary" id="new-booking-btn" style="max-width:260px;">حجز موعد جديد</button>
    `;
    document.getElementById('new-booking-btn').addEventListener('click', renderClinicsStep);

    loadMyBookings();
  } catch (err) {
    alert('حدث خطأ أثناء إرسال الطلب، حاول مرة أخرى');
    btn.disabled = false;
    btn.textContent = 'إرسال طلب الحجز';
  }
}

// ============================================
// مواعيدي
// ============================================
async function loadMyBookings() {
  const snap = await db.collection('bookings').where('patientId', '==', currentUid).get();
  const bookings = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

  const todayStr = todayISO();
  const upcoming = bookings
    .filter((b) => b.status !== 'rejected' && b.date >= todayStr)
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const past = bookings
    .filter((b) => b.status === 'rejected' || b.date < todayStr)
    .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));

  renderBookingsList('upcoming-appts-wrap', upcoming, 'ما فيه مواعيد قادمة حالياً');
  renderBookingsList('past-appts-wrap', past, 'ما فيه مواعيد سابقة');
}

function renderBookingsList(elementId, bookings, emptyText) {
  const wrap = document.getElementById(elementId);

  if (bookings.length === 0) {
    wrap.innerHTML = `<p class="empty-state">${emptyText}</p>`;
    return;
  }

  wrap.innerHTML = bookings.map((b) => `
    <div class="appt-card">
      <div>
        <p class="appt-main">د. ${escapeHtml(b.doctorName)}</p>
        <p class="appt-sub">${b.date} — ${b.time}</p>
      </div>
      ${bookingStatusBadge(b.status)}
    </div>
  `).join('');
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
  const labels = { pending: 'قيد الانتظار', accepted: 'مقبول', rejected: 'مرفوض' };
  const cls = { pending: 'badge-pending', accepted: 'badge-active', rejected: 'badge-rejected' };
  return `<span class="badge ${cls[status] || ''}">${labels[status] || status}</span>`;
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
