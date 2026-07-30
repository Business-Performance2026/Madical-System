// ============================================
// حماية الصفحة: لازم عيادة مسجّلة دخول وحسابها فعّال
// ============================================
let currentUid = null;
let clinicName = '';

const DAYS = [
  { key: 'sunday', label: 'الأحد' },
  { key: 'monday', label: 'الاثنين' },
  { key: 'tuesday', label: 'الثلاثاء' },
  { key: 'wednesday', label: 'الأربعاء' },
  { key: 'thursday', label: 'الخميس' },
  { key: 'friday', label: 'الجمعة' },
  { key: 'saturday', label: 'السبت' },
];

auth.onAuthStateChanged(async (user) => {
  if (!user) {
    window.location.href = '../index.html';
    return;
  }

  const userDoc = await db.collection('users').doc(user.uid).get();

  if (!userDoc.exists || userDoc.data().role !== 'clinic' || userDoc.data().status !== 'active') {
    await auth.signOut();
    window.location.href = '../index.html';
    return;
  }

  currentUid = user.uid;
  clinicName = userDoc.data().name || 'العيادة';
  document.getElementById('clinic-name').textContent = clinicName;

  loadDashboard();
});

document.getElementById('logout-btn').addEventListener('click', async () => {
  await auth.signOut();
  window.location.href = '../index.html';
});

// ============================================
// تحميل بيانات اللوحة
// ============================================
let cachedDoctors = [];
let editingDoctorId = null;
let cachedBookings = [];
let unsubscribeBookings = null;
let isInitialBookingsLoad = true;
let previousPendingIds = new Set();

async function loadDashboard() {
  await loadDoctorsOnly();
  setupBookingsListener();
}

async function loadDoctorsOnly() {
  const doctorsSnap = await db.collection('doctors').where('clinicId', '==', currentUid).get();
  cachedDoctors = doctorsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  renderDoctors();
}

// استماع فوري لمجموعة الحجوزات - أي حجز جديد يوصل يظهر مباشرة بدون تحديث الصفحة،
// مع تنبيه منبثق (toast) لو كان الحجز الجديد "قيد الانتظار"
function setupBookingsListener() {
  if (unsubscribeBookings) return; // مستمع شغّال أصلاً، ما نكرره

  unsubscribeBookings = db.collection('bookings')
    .where('clinicId', '==', currentUid)
    .onSnapshot((snap) => {
      const newBookings = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      const newPendingIds = newBookings.filter((b) => b.status === 'pending').map((b) => b.id);

      if (!isInitialBookingsLoad) {
        const freshlyAdded = newPendingIds.filter((id) => !previousPendingIds.has(id));
        if (freshlyAdded.length > 0) {
          const booking = newBookings.find((b) => b.id === freshlyAdded[0]);
          showNewBookingToast(booking, freshlyAdded.length);
        }
      }

      previousPendingIds = new Set(newPendingIds);
      isInitialBookingsLoad = false;
      cachedBookings = newBookings;

      renderStats();
      renderBookingRequests();
      renderRejectedBookings();
      renderWeeklySchedule();
    }, (err) => {
      console.error('bookings listener error:', err);
    });
}

// ============================================
// تنبيه منبثق (Toast) لحجز جديد
// ============================================
function showNewBookingToast(booking, count) {
  const root = document.getElementById('toast-root');
  const el = document.createElement('div');
  el.className = 'toast-notification';
  el.innerHTML = `
    <p class="toast-title">🔔 حجز جديد وصل${count > 1 ? ` (${count})` : ''}</p>
    <p class="toast-body">${escapeHtml(booking.patientName)} — ${escapeHtml(booking.doctorName)}<br>${booking.date} — ${booking.time}</p>
  `;
  el.addEventListener('click', () => {
    switchToTab('requests');
    document.getElementById('requests-wrap').scrollIntoView({ behavior: 'smooth', block: 'start' });
    el.remove();
  });
  root.appendChild(el);
  setTimeout(() => el.remove(), 8000);
}

// ============================================
// الإحصائيات
// ============================================
function renderStats() {
  const todayStr = todayISO();
  const todayCount = cachedBookings.filter((b) => b.date === todayStr && b.status === 'accepted').length;
  const upcomingCount = cachedBookings.filter((b) => b.date > todayStr && b.status === 'accepted').length;
  const pendingCount = cachedBookings.filter((b) => b.status === 'pending').length;
  const uniquePatients = new Set(cachedBookings.map((b) => b.patientId)).size;

  document.getElementById('stat-today').textContent = todayCount;
  document.getElementById('stat-upcoming').textContent = upcomingCount;
  document.getElementById('stat-pending').textContent = pendingCount;
  document.getElementById('stat-patients').textContent = uniquePatients;

  updateNotifBadge(pendingCount);
}

// شارة الجرس: تعرض عدد الطلبات "قيد الانتظار" فقط، وتختفي إذا وصل الصفر
function updateNotifBadge(pendingCount) {
  const badge = document.getElementById('notif-badge');
  badge.textContent = pendingCount;
  badge.classList.toggle('hidden', pendingCount === 0);
}

document.getElementById('notif-bell').addEventListener('click', () => {
  switchToTab('requests');
  document.getElementById('requests-wrap').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

// ============================================
// طلبات الحجز (قيد الانتظار)
// ============================================
function renderBookingRequests() {
  const wrap = document.getElementById('requests-wrap');
  const pending = cachedBookings
    .filter((b) => b.status === 'pending')
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));

  if (pending.length === 0) {
    wrap.innerHTML = '<p class="empty-state">لا توجد طلبات حجز جديدة حالياً</p>';
    return;
  }

  wrap.innerHTML = renderBookingsActionTable(pending);
  bindBookingsActionEvents(wrap);
}

// ============================================
// المواعيد المرفوضة (يقدر يعدّل/يحذف/يرجع يقبلها من هنا)
// ============================================
function renderRejectedBookings() {
  const wrap = document.getElementById('rejected-wrap');
  const rejected = cachedBookings
    .filter((b) => b.status === 'rejected')
    .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));

  if (rejected.length === 0) {
    wrap.innerHTML = '<p class="empty-state">لا توجد مواعيد مرفوضة حالياً</p>';
    return;
  }

  wrap.innerHTML = renderBookingsActionTable(rejected);
  bindBookingsActionEvents(wrap);
}

// جدول موحّد للحجوزات مع كل الإجراءات (يُستخدم لقسم الطلبات وقسم المرفوضة)
function renderBookingsActionTable(bookings) {
  return `
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>المريض</th>
            <th>رقم الحجز</th>
            <th>الطبيب</th>
            <th>التاريخ</th>
            <th>الوقت</th>
            <th>تواصل</th>
            <th>إجراء</th>
          </tr>
        </thead>
        <tbody>
          ${bookings.map((b) => (b.id === editingBookingId ? renderBookingEditRow(b, 7) : renderBookingRow(b))).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderBookingRow(b) {
  return `
    <tr>
      <td class="cell-name">${escapeHtml(b.patientName)}</td>
      <td class="cell-sub">${bookingNumber(b.id)}</td>
      <td>${escapeHtml(b.doctorName)}</td>
      <td class="cell-sub">${b.date}</td>
      <td class="cell-sub">${b.time}</td>
      <td>
        ${b.patientPhone
          ? `<a class="btn-xs whatsapp" href="${buildWhatsAppLink(b)}" target="_blank" rel="noopener">💬 واتساب</a>`
          : '<span class="cell-sub">—</span>'}
      </td>
      <td>
        <div class="row-actions">
          <button class="btn-xs approve" data-action="accept" data-id="${b.id}">قبول</button>
          <button class="btn-xs reject" data-action="reject" data-id="${b.id}">رفض</button>
          <button class="btn-xs toggle" data-action="edit" data-id="${b.id}">✏️</button>
          <button class="btn-xs delete" data-action="delete" data-id="${b.id}">🗑️</button>
        </div>
      </td>
    </tr>
  `;
}

// صف تعديل شامل: اسم المريض + جواله + التاريخ + الوقت مع بعض
function renderBookingEditRow(b, colspan) {
  return `
    <tr>
      <td colspan="${colspan}">
        <div class="mini-form">
          <input type="text" class="edit-booking-name" placeholder="اسم المريض" value="${escapeHtml(b.patientName)}">
          <input type="tel" class="edit-booking-phone" placeholder="رقم الجوال" value="${escapeHtml(b.patientPhone || '')}">
          <input type="date" class="edit-booking-date" value="${b.date}">
          <input type="time" class="edit-booking-time" value="${b.time}">
          <button type="button" class="btn-xs approve" data-action="save-booking-edit" data-id="${b.id}">💾 حفظ</button>
          <button type="button" class="btn-xs delete" data-action="cancel-booking-edit" data-id="${b.id}">إلغاء</button>
        </div>
      </td>
    </tr>
  `;
}

function bindBookingsActionEvents(wrap) {
  wrap.querySelectorAll('[data-action="accept"]').forEach((btn) => {
    btn.addEventListener('click', () => respondToBooking(btn.dataset.id, 'accepted'));
  });
  wrap.querySelectorAll('[data-action="reject"]').forEach((btn) => {
    btn.addEventListener('click', () => respondToBooking(btn.dataset.id, 'rejected'));
  });
  wrap.querySelectorAll('[data-action="edit"]').forEach((btn) => {
    btn.addEventListener('click', () => startBookingEdit(btn.dataset.id));
  });
  wrap.querySelectorAll('[data-action="cancel-booking-edit"]').forEach((btn) => {
    btn.addEventListener('click', cancelBookingEdit);
  });
  wrap.querySelectorAll('[data-action="save-booking-edit"]').forEach((btn) => {
    btn.addEventListener('click', () => saveBookingEdit(btn.dataset.id));
  });
  wrap.querySelectorAll('[data-action="delete"]').forEach((btn) => {
    btn.addEventListener('click', () => deleteBooking(btn.dataset.id));
  });
}

async function respondToBooking(bookingId, status) {
  const booking = cachedBookings.find((b) => b.id === bookingId);

  await db.collection('bookings').doc(bookingId).update({ status });

  // عند القبول: نسجل قفل وقت مستقل بمجموعة lockedSlots (بدون أي بيانات شخصية)
  // عشان صفحة المريض تقدر تتحقق من الأوقات المتاحة بدون ما تشوف حجوزات مرضى ثانين
  if (status === 'accepted' && booking) {
    await db.collection('lockedSlots').doc(buildLockId(booking.doctorId, booking.date, booking.time)).set({
      doctorId: booking.doctorId,
      clinicId: booking.clinicId,
      date: booking.date,
      time: booking.time,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  }

  loadDashboard();
}

function buildLockId(doctorId, date, time) {
  return `${doctorId}_${date}_${time.replace(':', '')}`;
}

// تعديل موعد الحجز (تاريخ/وقت) - لو كان مقبول، ننقل قفل الوقت للموعد الجديد تلقائياً
let editingBookingId = null;

// حفظ كل بيانات الحجز مع بعض (اسم المريض، جواله، التاريخ، الوقت)
// ملاحظة: يعدّل بيانات هذا الحجز فقط، ما يعدّل بيانات حساب المريض نفسه
async function saveBookingEdit(bookingId) {
  const row = document.querySelector(`[data-action="save-booking-edit"][data-id="${bookingId}"]`).closest('tr');
  const patientName = row.querySelector('.edit-booking-name').value.trim();
  const patientPhone = row.querySelector('.edit-booking-phone').value.trim();
  const newDate = row.querySelector('.edit-booking-date').value;
  const newTime = row.querySelector('.edit-booking-time').value;

  if (!patientName || !newDate || !newTime) {
    alert('الاسم والتاريخ والوقت إجباريين');
    return;
  }

  const booking = cachedBookings.find((b) => b.id === bookingId);
  if (!booking) return;

  try {
    await db.collection('bookings').doc(bookingId).update({
      patientName,
      patientPhone,
      date: newDate,
      time: newTime,
    });

    // لو كان الحجز مقبول وتغيّر الموعد، ننقل قفل الوقت للموعد الجديد تلقائياً
    if (booking.status === 'accepted' && (newDate !== booking.date || newTime !== booking.time)) {
      await db.collection('lockedSlots').doc(buildLockId(booking.doctorId, booking.date, booking.time)).delete();
      await db.collection('lockedSlots').doc(buildLockId(booking.doctorId, newDate, newTime)).set({
        doctorId: booking.doctorId,
        clinicId: booking.clinicId,
        date: newDate,
        time: newTime,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
    }

    editingBookingId = null;
    // ما نحتاج نستدعي تحميل يدوي، الاستماع الفوري (onSnapshot) بيحدّث الجداول تلقائياً
  } catch (err) {
    console.error('saveBookingEdit error:', err);
    alert('تعذر حفظ التعديلات، حاول مرة أخرى');
  }
}

function startBookingEdit(bookingId) {
  editingBookingId = bookingId;
  renderBookingRequests();
  renderRejectedBookings();
  renderWeeklySchedule();
}

function cancelBookingEdit() {
  editingBookingId = null;
  renderBookingRequests();
  renderRejectedBookings();
  renderWeeklySchedule();
}

// حذف حجز نهائياً - لو كان مقبول، نحرر قفل الوقت أيضاً
async function deleteBooking(bookingId) {
  const sure = confirm('متأكد إنك تبي تحذف هذا الحجز نهائياً؟ لا يمكن التراجع.');
  if (!sure) return;

  const booking = cachedBookings.find((b) => b.id === bookingId);

  try {
    await db.collection('bookings').doc(bookingId).delete();

    if (booking && booking.status === 'accepted') {
      await db.collection('lockedSlots').doc(buildLockId(booking.doctorId, booking.date, booking.time)).delete();
    }

    loadDashboard();
  } catch (err) {
    console.error('deleteBooking error:', err);
    alert('تعذر حذف الحجز، حاول مرة أخرى');
  }
}

// ============================================
// إضافة طبيب جديد
// ============================================
document.getElementById('add-doctor-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('new-doctor-name').value.trim();
  const specialty = document.getElementById('new-doctor-specialty').value.trim();

  if (!name || !specialty) return;

  await db.collection('doctors').add({
    clinicId: currentUid,
    name,
    specialty,
    workingHours: [],
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
  });

  document.getElementById('add-doctor-form').reset();
  loadDashboard();
});

// ============================================
// عرض الأطباء + إدارة أوقات العمل + الحذف
// ============================================
function renderDoctors() {
  const wrap = document.getElementById('doctors-wrap');

  if (cachedDoctors.length === 0) {
    wrap.innerHTML = '<p class="empty-state">ما أضفت أي طبيب بعد</p>';
    return;
  }

  wrap.innerHTML = `
    <div class="doctors-grid">
      ${cachedDoctors.map((doc) => (doc.id === editingDoctorId ? renderDoctorEditCard(doc) : renderDoctorCard(doc))).join('')}
    </div>
  `;

  wrap.querySelectorAll('[data-action="edit-doctor"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      editingDoctorId = btn.dataset.id;
      renderDoctors();
    });
  });
  wrap.querySelectorAll('[data-action="cancel-doctor-edit"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      editingDoctorId = null;
      renderDoctors();
    });
  });
  wrap.querySelectorAll('[data-action="save-doctor-edit"]').forEach((btn) => {
    btn.addEventListener('click', () => saveDoctorEdit(btn.dataset.id));
  });
  wrap.querySelectorAll('[data-action="delete-doctor"]').forEach((btn) => {
    btn.addEventListener('click', () => deleteDoctor(btn.dataset.id));
  });
  wrap.querySelectorAll('[data-action="remove-hour"]').forEach((btn) => {
    btn.addEventListener('click', () => removeWorkingHour(btn.dataset.id, Number(btn.dataset.index)));
  });
  wrap.querySelectorAll('[data-action="add-hour"]').forEach((btn) => {
    btn.addEventListener('click', () => addWorkingHour(btn.dataset.id));
  });
}

function renderDoctorCard(doc) {
  return `
    <div class="doctor-card">
      <div class="doctor-head">
        <div>
          <p class="doctor-name">${escapeHtml(doc.name)}</p>
          <p class="doctor-specialty">${escapeHtml(doc.specialty)}</p>
        </div>
        <div class="row-actions">
          <button class="btn-xs toggle" data-action="edit-doctor" data-id="${doc.id}">✏️</button>
          <button class="btn-xs delete" data-action="delete-doctor" data-id="${doc.id}">🗑️</button>
        </div>
      </div>

      ${renderDoctorHoursSection(doc)}
    </div>
  `;
}

// كرت التعديل: الاسم والتخصص مع بعض بنفس النموذج، وحفظ واحد للاثنين
function renderDoctorEditCard(doc) {
  return `
    <div class="doctor-card">
      <div class="mini-form" style="margin-bottom:14px;">
        <input type="text" class="edit-doctor-name" placeholder="اسم الطبيب" value="${escapeHtml(doc.name)}">
        <input type="text" class="edit-doctor-specialty" placeholder="التخصص" value="${escapeHtml(doc.specialty)}">
        <button type="button" class="btn-xs approve" data-action="save-doctor-edit" data-id="${doc.id}">💾 حفظ</button>
        <button type="button" class="btn-xs delete" data-action="cancel-doctor-edit" data-id="${doc.id}">إلغاء</button>
      </div>

      ${renderDoctorHoursSection(doc)}
    </div>
  `;
}

function renderDoctorHoursSection(doc) {
  return `
    <div class="hours-list">
      ${(doc.workingHours || []).length === 0
        ? '<span class="cell-sub">ما تم تحديد أوقات عمل بعد</span>'
        : doc.workingHours.map((h, i) => `
            <span class="hours-chip">
              ${h.date || dayLabel(h.day)} ${h.start} - ${h.end}
              <button data-action="remove-hour" data-id="${doc.id}" data-index="${i}">×</button>
            </span>
          `).join('')}
    </div>

    <div class="mini-form" data-add-hour-for="${doc.id}">
      <input type="date" class="hour-date">
      <input type="time" class="hour-start" value="09:00">
      <input type="time" class="hour-end" value="14:00">
      <button type="button" class="btn-xs toggle" data-action="add-hour" data-id="${doc.id}">إضافة وقت</button>
    </div>
  `;
}

// حفظ اسم وتخصص الطبيب مع بعض
// ملاحظة: ما يحدّث اسم الطبيب بالحجوزات القديمة المخزّنة مسبقاً (doctorName)، بس الجديدة بتاخذ الاسم المحدّث
async function saveDoctorEdit(doctorId) {
  const card = document.querySelector(`[data-action="save-doctor-edit"][data-id="${doctorId}"]`).closest('.doctor-card');
  const name = card.querySelector('.edit-doctor-name').value.trim();
  const specialty = card.querySelector('.edit-doctor-specialty').value.trim();

  if (!name || !specialty) {
    alert('اسم الطبيب والتخصص إجباريين');
    return;
  }

  try {
    await db.collection('doctors').doc(doctorId).update({ name, specialty });
    editingDoctorId = null;
    loadDashboard();
  } catch (err) {
    console.error('saveDoctorEdit error:', err);
    alert('تعذر حفظ التعديلات، حاول مرة أخرى');
  }
}

async function deleteDoctor(doctorId) {
  const sure = confirm('متأكد إنك تبي تحذف هذا الطبيب؟');
  if (!sure) return;
  await db.collection('doctors').doc(doctorId).delete();
  loadDashboard();
}

async function addWorkingHour(doctorId) {
  const card = document.querySelector(`[data-add-hour-for="${doctorId}"]`);
  const date = card.querySelector('.hour-date').value;
  const start = card.querySelector('.hour-start').value;
  const end = card.querySelector('.hour-end').value;

  if (!date) {
    alert('فضلاً اختر التاريخ');
    return;
  }

  if (!start || !end || start >= end) {
    alert('تأكد إن وقت البداية قبل وقت النهاية');
    return;
  }

  const doctor = cachedDoctors.find((d) => d.id === doctorId);
  const updatedHours = [...(doctor.workingHours || []), { date, start, end }];

  await db.collection('doctors').doc(doctorId).update({ workingHours: updatedHours });
  loadDashboard();
}

async function removeWorkingHour(doctorId, index) {
  const doctor = cachedDoctors.find((d) => d.id === doctorId);
  const updatedHours = (doctor.workingHours || []).filter((_, i) => i !== index);
  await db.collection('doctors').doc(doctorId).update({ workingHours: updatedHours });
  loadDashboard();
}

// ============================================
// الجدول الأسبوعي (المواعيد المقبولة فقط)
// ============================================
function renderWeeklySchedule() {
  const wrap = document.getElementById('schedule-wrap');
  const weekDates = getWeekDates();

  const accepted = cachedBookings.filter((b) => b.status === 'accepted');

  const hasAny = weekDates.some((d) => accepted.some((b) => b.date === d.iso));

  if (!hasAny) {
    wrap.innerHTML = '<p class="empty-state">لا توجد مواعيد مؤكدة هذا الأسبوع</p>';
    return;
  }

  wrap.innerHTML = weekDates.map((d) => {
    const dayBookings = accepted
      .filter((b) => b.date === d.iso)
      .sort((a, b) => a.time.localeCompare(b.time));

    if (dayBookings.length === 0) return '';

    return `
      <div class="schedule-day">
        <p class="schedule-day-title">${d.label} — ${d.iso}</p>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>الوقت</th>
                <th>المريض</th>
                <th>رقم الحجز</th>
                <th>الطبيب</th>
                <th>تواصل</th>
                <th>إجراء</th>
              </tr>
            </thead>
            <tbody>
              ${dayBookings.map((b) => (b.id === editingBookingId ? renderBookingEditRow(b, 6) : `
                <tr>
                  <td class="cell-sub">${b.time}</td>
                  <td class="cell-name">${escapeHtml(b.patientName)}</td>
                  <td class="cell-sub">${bookingNumber(b.id)}</td>
                  <td>${escapeHtml(b.doctorName)}</td>
                  <td>
                    ${b.patientPhone
                      ? `<a class="btn-xs whatsapp" href="${buildWhatsAppLink(b)}" target="_blank" rel="noopener">💬 واتساب</a>`
                      : '<span class="cell-sub">—</span>'}
                  </td>
                  <td>
                    <div class="row-actions">
                      <button class="btn-xs toggle" data-action="edit-schedule" data-id="${b.id}">✏️</button>
                      <button class="btn-xs delete" data-action="delete-schedule" data-id="${b.id}">🗑️</button>
                    </div>
                  </td>
                </tr>
              `)).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }).join('');

  wrap.querySelectorAll('[data-action="edit-schedule"]').forEach((btn) => {
    btn.addEventListener('click', () => startBookingEdit(btn.dataset.id));
  });
  wrap.querySelectorAll('[data-action="delete-schedule"]').forEach((btn) => {
    btn.addEventListener('click', () => deleteBooking(btn.dataset.id));
  });
  wrap.querySelectorAll('[data-action="cancel-booking-edit"]').forEach((btn) => {
    btn.addEventListener('click', cancelBookingEdit);
  });
  wrap.querySelectorAll('[data-action="save-booking-edit"]').forEach((btn) => {
    btn.addEventListener('click', () => saveBookingEdit(btn.dataset.id));
  });
}

function getWeekDates() {
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay()); // الأحد = أول الأسبوع

  return DAYS.map((d, i) => {
    const date = new Date(startOfWeek);
    date.setDate(startOfWeek.getDate() + i);
    return { label: d.label, iso: date.toISOString().slice(0, 10) };
  });
}

// ============================================
// بحث المرضى
// ============================================
document.getElementById('patient-search').addEventListener('input', (e) => {
  renderPatientSearch(e.target.value.trim());
});

function renderPatientSearch(query) {
  const wrap = document.getElementById('patients-wrap');

  const patientsMap = new Map();
  cachedBookings.forEach((b) => {
    if (!patientsMap.has(b.patientId)) {
      patientsMap.set(b.patientId, { name: b.patientName, phone: b.patientPhone, count: 0, lastDate: b.date });
    }
    const entry = patientsMap.get(b.patientId);
    entry.count += 1;
    if (b.date > entry.lastDate) entry.lastDate = b.date;
  });

  let patients = [...patientsMap.values()];

  if (query) {
    patients = patients.filter((p) => p.name && p.name.includes(query));
  }

  if (patients.length === 0) {
    wrap.innerHTML = `<p class="empty-state">${query ? 'ما فيه نتائج مطابقة' : 'ما فيه مرضى مسجّلين بعد'}</p>`;
    return;
  }

  wrap.innerHTML = `
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>اسم المريض</th>
            <th>رقم الجوال</th>
            <th>عدد الحجوزات</th>
            <th>آخر موعد</th>
          </tr>
        </thead>
        <tbody>
          ${patients.map((p) => `
            <tr>
              <td class="cell-name">${escapeHtml(p.name)}</td>
              <td class="cell-sub">${escapeHtml(p.phone) || '—'}</td>
              <td>${p.count}</td>
              <td class="cell-sub">${p.lastDate}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// ============================================
// رسالة واتساب رسمية للمريض (تحتوي رقم الحجز والموعد واسم العيادة)
// ============================================
function buildWhatsAppLink(booking) {
  const message = buildBookingMessage(booking);
  return `https://wa.me/${sanitizePhone(booking.patientPhone)}?text=${encodeURIComponent(message)}`;
}

function buildBookingMessage(booking) {
  return [
    `السلام عليكم ${booking.patientName}،`,
    ``,
    `نفيدكم بخصوص طلب الحجز رقم ${bookingNumber(booking.id)}`,
    `📅 التاريخ: ${booking.date}`,
    `🕐 الوقت: ${booking.time}`,
    ``,
    `نأمل تأكيد الحضور في الموعد المحدد، ولأي استفسار نحن بخدمتكم.`,
    ``,
    `مع تحيات إدارة ${clinicName}`,
  ].join('\n');
}

function bookingNumber(id) {
  return id.slice(-6).toUpperCase();
}

function sanitizePhone(phone) {
  return (phone || '').replace(/[^0-9]/g, '');
}

// ============================================
// أدوات مساعدة
// ============================================
function dayLabel(key) {
  const found = DAYS.find((d) => d.key === key);
  return found ? found.label : key;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
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
