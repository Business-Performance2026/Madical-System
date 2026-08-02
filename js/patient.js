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
  loadMyBookings().then(promptPendingRatingOnce);
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
let doctorRatingsMap = {};
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

  const [doctorsSnap, reviewsSnap] = await Promise.all([
    db.collection('doctors').where('clinicId', '==', selectedClinic.id).get(),
    db.collection('reviews').where('clinicId', '==', selectedClinic.id).get(),
  ]);

  clinicDoctors = doctorsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

  doctorRatingsMap = {};
  reviewsSnap.docs.forEach((doc) => {
    const r = doc.data();
    if (!doctorRatingsMap[r.doctorId]) doctorRatingsMap[r.doctorId] = { sum: 0, count: 0 };
    doctorRatingsMap[r.doctorId].sum += r.rating;
    doctorRatingsMap[r.doctorId].count += 1;
  });

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

  listEl.innerHTML = clinicDoctors.map((d) => {
    const ratingInfo = doctorRatingsMap[d.id];
    const ratingText = ratingInfo
      ? `⭐ ${(ratingInfo.sum / ratingInfo.count).toFixed(1)} (${ratingInfo.count} تقييم)`
      : 'ما فيه تقييمات بعد';

    return `
    <div class="choice-card" data-id="${d.id}">
      <div>
        <p class="choice-title">${escapeHtml(d.name)}</p>
        <p class="choice-sub">${escapeHtml(d.specialty)} • ${ratingText}</p>
      </div>
      <span class="choice-arrow">‹</span>
    </div>
  `;
  }).join('');

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
let currentCalendarMonth = null; // أول يوم بالشهر المعروض حالياً بالتقويم

function renderDateStep() {
  const wrap = document.getElementById('booking-steps');

  const today = new Date();
  currentCalendarMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  wrap.innerHTML = `
    <span class="step-hint">الخطوة 3 من 3: اختر الموعد — د. ${escapeHtml(selectedDoctor.name)}</span>
    <button type="button" class="btn-outline" id="back-to-doctors" style="margin-bottom:16px;">‹ رجوع لاختيار الطبيب</button>

    <div class="calendar-legend">
      <span class="legend-item"><span class="legend-dot legend-available"></span>يوجد دوام</span>
      <span class="legend-item"><span class="legend-dot legend-unavailable"></span>ما يوجد دوام</span>
    </div>

    <div class="booking-calendar" id="booking-calendar"></div>

    <div id="slots-wrap"></div>
    <div id="confirm-wrap"></div>
  `;

  document.getElementById('back-to-doctors').addEventListener('click', renderDoctorsStep);
  renderCalendarGrid();
}

// يتحقق هل عند الطبيب دوام بتاريخ معيّن (تاريخ محدد فعلياً، أو يوم أسبوع متكرر بالأنظمة القديمة)
function isDateAvailable(dateISO) {
  const dayKey = DAYS[new Date(dateISO + 'T00:00:00').getDay()].key;
  return (selectedDoctor.workingHours || []).some((h) => h.date === dateISO || (!h.date && h.day === dayKey));
}

function renderCalendarGrid() {
  const cal = document.getElementById('booking-calendar');
  const todayStr = todayISO();
  const year = currentCalendarMonth.getFullYear();
  const month = currentCalendarMonth.getMonth();

  const monthNames = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  const firstOfMonth = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startOffset = firstOfMonth.getDay(); // 0 = الأحد

  const isCurrentMonth = year === new Date().getFullYear() && month === new Date().getMonth();
  const maxMonthsAhead = 3;
  const monthsFromNow = (year - new Date().getFullYear()) * 12 + (month - new Date().getMonth());

  let cellsHtml = '';
  for (let i = 0; i < startOffset; i++) {
    cellsHtml += '<span class="calendar-cell calendar-cell-empty"></span>';
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dateObj = new Date(year, month, d);
    const dateISO = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const isPast = dateISO < todayStr;
    const available = !isPast && isDateAvailable(dateISO);
    const isSelected = dateISO === selectedDate;
    const isToday = dateISO === todayStr;

    const classes = ['calendar-cell'];
    if (isPast) classes.push('calendar-cell-past');
    else if (available) classes.push('calendar-cell-available');
    else classes.push('calendar-cell-unavailable');
    if (isSelected) classes.push('calendar-cell-selected');
    if (isToday) classes.push('calendar-cell-today');

    cellsHtml += `<button type="button" class="${classes.join(' ')}" ${(!available || isPast) ? 'disabled' : ''} data-date="${dateISO}">${d}</button>`;
  }

  cal.innerHTML = `
    <div class="calendar-header">
      <button type="button" class="calendar-nav" id="cal-prev" ${isCurrentMonth ? 'disabled' : ''}>›</button>
      <span class="calendar-month-label">${monthNames[month]} ${year}</span>
      <button type="button" class="calendar-nav" id="cal-next" ${monthsFromNow >= maxMonthsAhead ? 'disabled' : ''}>‹</button>
    </div>
    <div class="calendar-weekdays">
      ${DAYS.map((d) => `<span>${d.label.slice(0, 3)}</span>`).join('')}
    </div>
    <div class="calendar-grid">${cellsHtml}</div>
  `;

  document.getElementById('cal-prev').addEventListener('click', () => changeCalendarMonth(-1));
  document.getElementById('cal-next').addEventListener('click', () => changeCalendarMonth(1));

  cal.querySelectorAll('.calendar-cell-available').forEach((btn) => {
    btn.addEventListener('click', async () => {
      selectedDate = btn.dataset.date;
      selectedTime = '';
      document.getElementById('confirm-wrap').innerHTML = '';
      cal.querySelectorAll('.calendar-cell').forEach((c) => c.classList.remove('calendar-cell-selected'));
      btn.classList.add('calendar-cell-selected');
      await renderAvailableSlots();
    });
  });
}

function changeCalendarMonth(delta) {
  currentCalendarMonth = new Date(currentCalendarMonth.getFullYear(), currentCalendarMonth.getMonth() + delta, 1);
  renderCalendarGrid();
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

let myReviews = {}; // { bookingId: { rating, comment } }

async function loadMyBookings() {
  const [bookingsSnap, reviewsSnap] = await Promise.all([
    db.collection('bookings').where('patientId', '==', currentUid).get(),
    db.collection('reviews').where('patientId', '==', currentUid).get(),
  ]);

  const bookings = bookingsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  cachedMyBookings = bookings;

  myReviews = {};
  reviewsSnap.docs.forEach((doc) => { myReviews[doc.id] = doc.data(); });

  const todayStr = todayISO();
  const upcoming = bookings
    .filter((b) => b.status !== 'rejected' && b.status !== 'cancelled' && b.status !== 'no_show' && b.date >= todayStr)
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const past = bookings
    .filter((b) => b.status === 'rejected' || b.status === 'cancelled' || b.status === 'no_show' || b.date < todayStr)
    .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));

  renderBookingsList('upcoming-appts-wrap', upcoming, 'ما فيه مواعيد قادمة حالياً', true);
  renderBookingsList('past-appts-wrap', past, 'ما فيه مواعيد سابقة', false);
}

function renderBookingsList(elementId, bookings, emptyText, isUpcoming) {
  const wrap = document.getElementById(elementId);

  if (bookings.length === 0) {
    wrap.innerHTML = `<p class="empty-state">${emptyText}</p>`;
    return;
  }

  wrap.innerHTML = bookings.map((b) => {
    const myReview = myReviews[b.id];
    const canRate = !isUpcoming && b.status === 'accepted' && !myReview;

    return `
    <div class="appt-card">
      <div>
        <p class="appt-main">د. ${escapeHtml(b.doctorName)}</p>
        <p class="appt-sub">${b.date} — ${b.time} • رقم الحجز: ${bookingNumber(b.id)}</p>
        ${myReview ? `<p class="appt-sub">${starsDisplay(myReview.rating)} ${myReview.comment ? '— ' + escapeHtml(myReview.comment) : ''}</p>` : ''}
      </div>
      <div class="appt-actions">
        ${bookingStatusBadge(b.status)}
        ${isUpcoming && (b.status === 'pending' || b.status === 'accepted')
          ? `
            <button type="button" class="btn-xs toggle" data-action="reschedule" data-id="${b.id}">🔁 إعادة جدولة</button>
            <button type="button" class="btn-xs delete" data-action="cancel" data-id="${b.id}">إلغاء الحجز</button>
          `
          : ''}
        ${canRate ? `<button type="button" class="btn-xs approve" data-action="rate" data-id="${b.id}">⭐ قيّم زيارتك</button>` : ''}
      </div>
    </div>
  `;
  }).join('');

  wrap.querySelectorAll('[data-action="cancel"]').forEach((btn) => {
    btn.addEventListener('click', () => cancelBooking(btn.dataset.id));
  });
  wrap.querySelectorAll('[data-action="reschedule"]').forEach((btn) => {
    btn.addEventListener('click', () => startReschedule(btn.dataset.id));
  });
  wrap.querySelectorAll('[data-action="rate"]').forEach((btn) => {
    btn.addEventListener('click', () => openRatingModal(btn.dataset.id));
  });
}

function starsDisplay(rating) {
  return '⭐'.repeat(rating) + '☆'.repeat(5 - rating);
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

// ============================================
// إعادة جدولة الموعد: نلغي الحجز الحالي ونوديه مباشرة لخطوة اختيار وقت جديد لنفس الطبيب
// ============================================
async function startReschedule(bookingId) {
  const booking = cachedMyBookings.find((b) => b.id === bookingId);
  if (!booking) return;

  const sure = confirm('بنلغي هذا الموعد ونوديك تختار وقت جديد لنفس الطبيب. تكمل؟');
  if (!sure) return;

  try {
    await db.collection('bookings').doc(bookingId).update({ status: 'cancelled' });
    if (booking.status === 'accepted') {
      await db.collection('lockedSlots').doc(buildLockId(booking.doctorId, booking.date, booking.time)).delete();
    }

    const doctorDoc = await db.collection('doctors').doc(booking.doctorId).get();
    if (!doctorDoc.exists) {
      alert('تعذر جلب بيانات الطبيب، جرب تحجز من جديد يدوياً');
      loadMyBookings();
      return;
    }

    selectedClinic = allClinics.find((c) => c.id === booking.clinicId) || { id: booking.clinicId, name: '' };
    selectedDoctor = { id: doctorDoc.id, ...doctorDoc.data() };
    selectedDate = '';
    selectedTime = '';

    switchToTab('booking');
    renderDateStep();
    loadMyBookings();
  } catch (err) {
    console.error('startReschedule error:', err);
    alert('تعذر بدء إعادة الجدولة، حاول مرة أخرى');
  }
}

// ============================================
// تقييم الطبيب بعد الزيارة (نجوم + تعليق)
// ============================================
// يعرض تذكير تقييم تلقائي مرة وحدة بكل جلسة دخول، لو فيه زيارة مكتملة ما اتقيّمت بعد
let hasShownRatingPrompt = false;
function promptPendingRatingOnce() {
  if (hasShownRatingPrompt) return;

  const todayStr = todayISO();
  const unrated = cachedMyBookings
    .filter((b) => b.status === 'accepted' && b.date < todayStr && !myReviews[b.id])
    .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time)); // الأحدث أول

  if (unrated.length === 0) return;

  hasShownRatingPrompt = true;
  openRatingModal(unrated[0].id, true);
}

function openRatingModal(bookingId, isAutoPrompt) {
  const booking = cachedMyBookings.find((b) => b.id === bookingId);
  if (!booking) return;

  let selectedStars = 0;

  showModal(`
    <h3>⭐ قيّم زيارتك</h3>
    <p class="cell-sub">مع د. ${escapeHtml(booking.doctorName)} — ${booking.date}</p>
    <div class="star-picker" id="star-picker">
      ${[1, 2, 3, 4, 5].map((n) => `<button type="button" class="star-btn" data-star="${n}">☆</button>`).join('')}
    </div>
    <textarea id="rating-comment" class="rating-textarea" placeholder="تعليقك (اختياري)..." rows="3"></textarea>
    <button type="button" class="btn-primary" id="submit-rating-btn">إرسال التقييم</button>
    ${isAutoPrompt ? '<button type="button" class="btn-outline" id="later-rating-btn" style="margin-top:10px;">لاحقاً</button>' : ''}
  `);

  const laterBtn = document.getElementById('later-rating-btn');
  if (laterBtn) laterBtn.addEventListener('click', closeModal);

  const starButtons = document.querySelectorAll('.star-btn');
  starButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      selectedStars = Number(btn.dataset.star);
      starButtons.forEach((b) => {
        b.textContent = Number(b.dataset.star) <= selectedStars ? '⭐' : '☆';
      });
    });
  });

  document.getElementById('submit-rating-btn').addEventListener('click', async () => {
    if (selectedStars < 1) {
      alert('اختر تقييم من 1 إلى 5 نجوم');
      return;
    }

    const comment = document.getElementById('rating-comment').value.trim();
    const submitBtn = document.getElementById('submit-rating-btn');
    submitBtn.disabled = true;
    submitBtn.textContent = 'جاري الإرسال...';

    try {
      await db.collection('reviews').doc(bookingId).set({
        bookingId,
        doctorId: booking.doctorId,
        clinicId: booking.clinicId,
        patientId: currentUid,
        rating: selectedStars,
        comment,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });

      closeModal();
      loadMyBookings();
    } catch (err) {
      console.error('submitRating error:', err);
      alert('تعذر إرسال التقييم، حاول مرة أخرى');
      submitBtn.disabled = false;
      submitBtn.textContent = 'إرسال التقييم';
    }
  });
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
  const labels = { pending: 'قيد الانتظار', accepted: 'مقبول', rejected: 'مرفوض', cancelled: 'ملغى', no_show: 'لم يحضر' };
  const cls = { pending: 'badge-pending', accepted: 'badge-active', rejected: 'badge-rejected', cancelled: 'badge-cancelled', no_show: 'badge-no-show' };
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
