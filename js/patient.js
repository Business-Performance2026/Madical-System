// ============================================
// حماية الصفحة: لازم مريض مسجّل دخول وحسابه فعّال
// ============================================
let currentUid = null;
let patientName = '';
let patientPhone = '';
let familyMembers = [];

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

  if (user.isAnonymous) {
    showGuestBanner();
  }

  loadClinics();
  loadFamilyMembers();
  loadMyWaitlist();
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

    // لو دخل برابط حجز مباشر لعيادة معيّنة (?clinic=uid)، نوديه لخطوة اختيار الطبيب فوراً
    const clinicParam = new URLSearchParams(window.location.search).get('clinic');
    const directClinic = clinicParam && allClinics.find((c) => c.id === clinicParam);

    if (directClinic) {
      selectedClinic = directClinic;
      goToDoctorsStep();
    } else {
      renderClinicsStep();
    }
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

  const allSlots = hoursForDay.flatMap((h) => generateSlots(h.start, h.end, selectedDoctor.slotMinutes));
  const availableSlots = [...new Set(allSlots)].filter((t) => !bookedTimes.has(t)).sort();

  if (availableSlots.length === 0) {
    slotsWrap.innerHTML = `
      <p class="warning-text">⚠️ كل الأوقات محجوزة باليوم المختار، جرّب يوم ثاني</p>
      <button type="button" class="btn-xs toggle" id="join-waitlist-btn">🔔 انضم لقائمة الانتظار لهذا اليوم</button>
    `;
    document.getElementById('join-waitlist-btn').addEventListener('click', joinWaitlist);
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
      <div class="field">
        <label for="booking-for-select">الحجز لـ</label>
        <select id="booking-for-select">
          <option value="__self__">نفسي (${escapeHtml(patientName)})</option>
          ${familyMembers.map((f) => `<option value="${f.id}">${escapeHtml(f.name)}</option>`).join('')}
          <option value="__new__">+ إضافة فرد جديد من العائلة</option>
        </select>
      </div>
      <div class="field hidden" id="new-family-member-field">
        <label for="new-family-member-name">اسم الفرد الجديد</label>
        <input type="text" id="new-family-member-name" placeholder="مثال: سارة (الزوجة)">
      </div>
      <button type="button" class="btn-primary" id="confirm-booking-btn">إرسال طلب الحجز</button>
    </div>
  `;

  document.getElementById('booking-for-select').addEventListener('change', (e) => {
    document.getElementById('new-family-member-field').classList.toggle('hidden', e.target.value !== '__new__');
  });

  document.getElementById('confirm-booking-btn').addEventListener('click', submitBooking);
}

async function loadFamilyMembers() {
  try {
    const snap = await db.collection('familyMembers').where('patientId', '==', currentUid).get();
    familyMembers = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  } catch (err) {
    console.error('loadFamilyMembers error:', err);
  }
}

async function submitBooking() {
  const btn = document.getElementById('confirm-booking-btn');
  const bookingForSelect = document.getElementById('booking-for-select');
  const bookingForValue = bookingForSelect.value;

  let bookedForName = patientName;

  if (bookingForValue === '__new__') {
    const newName = document.getElementById('new-family-member-name').value.trim();
    if (!newName) {
      alert('اكتب اسم الفرد الجديد أول');
      return;
    }
    bookedForName = newName;
  } else if (bookingForValue !== '__self__') {
    const member = familyMembers.find((f) => f.id === bookingForValue);
    if (member) bookedForName = member.name;
  }

  btn.disabled = true;
  btn.textContent = 'جاري الإرسال...';

  try {
    // لو اختار "فرد جديد"، نحفظه بقائمة العائلة عشان يظهر بالمرات الجاية
    if (bookingForValue === '__new__') {
      await db.collection('familyMembers').add({
        patientId: currentUid,
        name: bookedForName,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
      loadFamilyMembers();
    }

    const docRef = await db.collection('bookings').add({
      clinicId: selectedClinic.id,
      doctorId: selectedDoctor.id,
      doctorName: selectedDoctor.name,
      patientId: currentUid,
      patientName: bookedForName,
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
// قائمة الانتظار
// ============================================
async function joinWaitlist() {
  const btn = document.getElementById('join-waitlist-btn');

  // نتأكد ما انضم قبل لنفس اليوم مع نفس الطبيب
  const existing = await db.collection('waitlist')
    .where('patientId', '==', currentUid)
    .where('doctorId', '==', selectedDoctor.id)
    .where('date', '==', selectedDate)
    .get();

  if (!existing.empty) {
    alert('أنت مسجّل بقائمة الانتظار لهذا اليوم مسبقاً');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'جاري الإضافة...';

  try {
    await db.collection('waitlist').add({
      clinicId: selectedClinic.id,
      doctorId: selectedDoctor.id,
      doctorName: selectedDoctor.name,
      patientId: currentUid,
      patientName: patientName,
      patientPhone: patientPhone,
      date: selectedDate,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });

    alert('✅ تم تسجيلك بقائمة الانتظار — بنعلمك أول ما يتحرر وقت بهذا اليوم');
    btn.textContent = '✅ مسجّل بقائمة الانتظار';
    loadMyWaitlist();
  } catch (err) {
    console.error('joinWaitlist error:', err);
    alert('تعذر الانضمام لقائمة الانتظار، حاول مرة أخرى');
    btn.disabled = false;
    btn.textContent = '🔔 انضم لقائمة الانتظار لهذا اليوم';
  }
}

let cachedWaitlist = [];

async function loadMyWaitlist() {
  const wrap = document.getElementById('my-waitlist-wrap');
  if (!wrap) return;

  try {
    const snap = await db.collection('waitlist').where('patientId', '==', currentUid).get();
    cachedWaitlist = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

    if (cachedWaitlist.length === 0) {
      wrap.innerHTML = '';
      return;
    }

    wrap.innerHTML = `
      <h3 class="mini-section-title" style="margin-top:24px;">🔔 قوائم انتظاري</h3>
      <div id="waitlist-items-wrap" class="loading-state">جاري فحص التوفر...</div>
    `;

    await renderWaitlistItems();
  } catch (err) {
    console.error('loadMyWaitlist error:', err);
  }
}

// يفحص لكل عنصر بقائمة الانتظار هل فيه وقت متاح الآن فعلياً، ويعرض النتيجة
async function renderWaitlistItems() {
  const itemsWrap = document.getElementById('waitlist-items-wrap');
  if (!itemsWrap) return;

  const results = await Promise.all(cachedWaitlist.map(async (w) => {
    const doctorDoc = await db.collection('doctors').doc(w.doctorId).get();
    if (!doctorDoc.exists) return { ...w, available: false };

    const doctor = doctorDoc.data();
    const dayKey = DAYS[new Date(w.date + 'T00:00:00').getDay()].key;
    const hoursForDay = (doctor.workingHours || []).filter((h) => h.date === w.date || (!h.date && h.day === dayKey));

    if (hoursForDay.length === 0) return { ...w, available: false };

    const lockedSnap = await db.collection('lockedSlots').where('doctorId', '==', w.doctorId).where('date', '==', w.date).get();
    const bookedTimes = new Set(lockedSnap.docs.map((doc) => doc.data().time));
    const allSlots = hoursForDay.flatMap((h) => generateSlots(h.start, h.end, doctor.slotMinutes));
    const available = allSlots.some((t) => !bookedTimes.has(t));

    return { ...w, available };
  }));

  itemsWrap.innerHTML = results.map((w) => `
    <div class="waitlist-item ${w.available ? 'waitlist-open' : ''}">
      <div>
        <p class="appt-main">د. ${escapeHtml(w.doctorName)}</p>
        <p class="appt-sub">${w.date}</p>
      </div>
      <div class="appt-actions">
        ${w.available
          ? `<button type="button" class="btn-xs approve" data-action="book-now" data-doctor="${w.doctorId}" data-date="${w.date}">🎉 فيه وقت متاح — احجز الآن</button>`
          : '<span class="badge badge-pending">⏳ لسا مشغول</span>'}
        <button type="button" class="btn-xs delete" data-action="leave-waitlist" data-id="${w.id}">إلغاء</button>
      </div>
    </div>
  `).join('');

  itemsWrap.querySelectorAll('[data-action="leave-waitlist"]').forEach((btn) => {
    btn.addEventListener('click', () => leaveWaitlist(btn.dataset.id));
  });
  itemsWrap.querySelectorAll('[data-action="book-now"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const doctorDoc = await db.collection('doctors').doc(btn.dataset.doctor).get();
      if (!doctorDoc.exists) return;
      selectedDoctor = { id: doctorDoc.id, ...doctorDoc.data() };
      selectedDate = btn.dataset.date;
      selectedTime = '';
      switchToTab('booking');
      renderDateStep();
    });
  });
}

async function leaveWaitlist(entryId) {
  try {
    await db.collection('waitlist').doc(entryId).delete();
    loadMyWaitlist();
  } catch (err) {
    console.error('leaveWaitlist error:', err);
    alert('تعذر الإلغاء، حاول مرة أخرى');
  }
}

// ============================================
// أدوات مساعدة
// ============================================
function generateSlots(start, end, slotMinutes) {
  const duration = slotMinutes || SLOT_MINUTES;
  const slots = [];
  let [h, m] = start.split(':').map(Number);
  const [endH, endM] = end.split(':').map(Number);
  const endTotal = endH * 60 + endM;

  let current = h * 60 + m;
  while (current + duration <= endTotal) {
    const hh = String(Math.floor(current / 60)).padStart(2, '0');
    const mm = String(current % 60).padStart(2, '0');
    slots.push(`${hh}:${mm}`);
    current += duration;
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

// ============================================
// شريط تنبيه للضيف + تحويل الحساب المؤقت لدائم بدون خسارة الحجوزات
// ============================================
function showGuestBanner() {
  const wrap = document.getElementById('guest-banner-wrap');
  if (!wrap) return;

  wrap.innerHTML = `
    <div class="guest-banner">
      <p>👋 أنت تستخدم حساب ضيف مؤقت — مربوط بهذا الجهاز/المتصفح بس. احفظ حسابك عشان توصل لحجوزاتك من أي جهاز ولا تخسرها.</p>
      <button type="button" class="btn-xs approve" id="save-guest-account-btn">💾 احفظ حسابك الآن</button>
    </div>
  `;

  document.getElementById('save-guest-account-btn').addEventListener('click', openSaveAccountModal);
}

function openSaveAccountModal() {
  showModal(`
    <h3>💾 احفظ حسابك</h3>
    <p class="cell-sub">أضف بريد إلكتروني وكلمة مرور — كل حجوزاتك الحالية تبقى معك بدون أي تغيير</p>
    <div class="field">
      <label for="save-account-email">البريد الإلكتروني</label>
      <input type="email" id="save-account-email" placeholder="example@email.com">
    </div>
    <div class="field">
      <label for="save-account-password">كلمة المرور</label>
      <input type="password" id="save-account-password" minlength="6" placeholder="6 أحرف على الأقل">
    </div>
    <button type="button" class="btn-primary" id="submit-save-account-btn">حفظ الحساب</button>
  `);

  document.getElementById('submit-save-account-btn').addEventListener('click', saveGuestAccount);
}

async function saveGuestAccount() {
  const email = document.getElementById('save-account-email').value.trim();
  const password = document.getElementById('save-account-password').value;
  const btn = document.getElementById('submit-save-account-btn');

  if (!email || !password || password.length < 6) {
    alert('تأكد من البريد الإلكتروني وكلمة مرور 6 أحرف على الأقل');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'جاري الحفظ...';

  try {
    const credential = firebase.auth.EmailAuthProvider.credential(email, password);
    await auth.currentUser.linkWithCredential(credential);

    await db.collection('users').doc(currentUid).update({ email, isGuest: false });

    closeModal();
    document.getElementById('guest-banner-wrap').innerHTML = '';
    alert('تم حفظ حسابك بنجاح! تقدر تسجّل دخول بهذا البريد من أي جهاز بعدين');
  } catch (err) {
    console.error('saveGuestAccount error:', err);
    const messages = {
      'auth/email-already-in-use': 'هذا البريد مستخدم مسبقاً، جرب بريد ثاني',
      'auth/invalid-email': 'صيغة البريد غير صحيحة',
      'auth/weak-password': 'كلمة المرور ضعيفة',
    };
    alert(messages[err.code] || 'تعذر حفظ الحساب، حاول مرة أخرى');
    btn.disabled = false;
    btn.textContent = 'حفظ الحساب';
  }
}

initPageTabs();
