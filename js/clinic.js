// ============================================
// حماية الصفحة: لازم عيادة (أو موظف تابع لها) مسجّل دخول وحسابه فعّال
// ============================================
let currentUid = null;      // uid الحساب المسجّل دخول فعلياً (عيادة أو موظف)
let activeClinicUid = null; // uid العيادة الأساسية اللي تنتمي لها كل البيانات (أطباء/حجوزات)
let clinicName = '';        // اسم العيادة نفسها (يُستخدم برسائل الواتساب والطباعة)
let isPrimaryOwner = false; // true لو صاحب حساب العيادة الأصلي، false لو موظف تابع

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
  const userData = userDoc.exists ? userDoc.data() : null;
  const validRole = userData && (userData.role === 'clinic' || userData.role === 'staff');

  if (!validRole || userData.status !== 'active') {
    await auth.signOut();
    window.location.href = '../index.html';
    return;
  }

  currentUid = user.uid;
  isPrimaryOwner = userData.role === 'clinic';

  if (isPrimaryOwner) {
    activeClinicUid = user.uid;
    clinicName = userData.name || t('role_clinic');
  } else {
    // موظف: نجيب اسم العيادة الأساسية من حساب صاحبها
    activeClinicUid = userData.staffOf;
    const ownerDoc = await db.collection('users').doc(activeClinicUid).get();
    clinicName = ownerDoc.exists ? (ownerDoc.data().name || t('role_clinic')) : t('role_clinic');
  }

  document.getElementById('clinic-name').textContent = userData.name || clinicName;

  const staffIndicator = document.getElementById('staff-indicator');
  if (!isPrimaryOwner && staffIndicator) {
    staffIndicator.textContent = t('staff_of', clinicName);
    staffIndicator.classList.remove('hidden');
  }

  // قسم "الموظفين" و"إعدادات العيادة" يظهرون بس لصاحب الحساب الأساسي، مو للموظفين أنفسهم
  const staffTabBtn = document.querySelector('.page-tabs button[data-tab="staff"]');
  const staffPanel = document.querySelector('.tab-panel[data-panel="staff"]');
  const settingsTabBtn = document.querySelector('.page-tabs button[data-tab="settings"]');
  const settingsPanel = document.querySelector('.tab-panel[data-panel="settings"]');
  if (!isPrimaryOwner) {
    if (staffTabBtn) staffTabBtn.remove();
    if (staffPanel) staffPanel.remove();
    if (settingsTabBtn) settingsTabBtn.remove();
    if (settingsPanel) settingsPanel.remove();
  }

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
  if (isPrimaryOwner) {
    loadStaffList();
    loadClinicLogo();
  }
}

async function loadDoctorsOnly() {
  const doctorsSnap = await db.collection('doctors').where('clinicId', '==', activeClinicUid).get();
  cachedDoctors = doctorsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  renderDoctors();
  populateDoctorFilterOptions();
}

// استماع فوري لمجموعة الحجوزات - أي حجز جديد يوصل يظهر مباشرة بدون تحديث الصفحة،
// مع تنبيه منبثق (toast) لو كان الحجز الجديد "قيد الانتظار"
function setupBookingsListener() {
  if (unsubscribeBookings) return; // مستمع شغّال أصلاً، ما نكرره

  unsubscribeBookings = db.collection('bookings')
    .where('clinicId', '==', activeClinicUid)
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
      renderUpcoming24h();
      renderAnalytics();
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
    <p class="toast-title">🔔 ${t('clinic_tab_requests')}${count > 1 ? ` (${count})` : ''}</p>
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
    wrap.innerHTML = `<p class="empty-state">${t('no_requests')}</p>`;
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
    wrap.innerHTML = `<p class="empty-state">${t('no_rejected')}</p>`;
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
            <th data-i18n="col_patient">${t('col_patient')}</th>
            <th data-i18n="col_booking_number">${t('col_booking_number')}</th>
            <th data-i18n="col_doctor">${t('col_doctor')}</th>
            <th data-i18n="col_date">${t('col_date')}</th>
            <th data-i18n="col_time">${t('col_time')}</th>
            <th data-i18n="col_contact">${t('col_contact')}</th>
            <th data-i18n="col_action">${t('col_action')}</th>
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
      <td class="cell-name">
        ${escapeHtml(b.patientName)}
        ${b.caseDescription ? `<p class="case-description" title="${escapeHtml(b.caseDescription)}">📝 ${escapeHtml(b.caseDescription)}</p>` : ''}
      </td>
      <td class="cell-sub">${bookingNumber(b.id)}</td>
      <td>${escapeHtml(b.doctorName)}</td>
      <td class="cell-sub">${b.date}</td>
      <td class="cell-sub">${b.time}</td>
      <td>
        ${b.patientPhone
          ? `<a class="btn-xs whatsapp" href="${buildWhatsAppLink(b)}" target="_blank" rel="noopener">${t('whatsapp_btn')}</a>`
          : '<span class="cell-sub">—</span>'}
      </td>
      <td>
        <div class="row-actions">
          <button class="btn-xs approve" data-action="accept" data-id="${b.id}">${t('approve_btn')}</button>
          <button class="btn-xs reject" data-action="reject" data-id="${b.id}">${t('reject_btn')}</button>
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
          <input type="text" class="edit-booking-name" placeholder="${t('col_patient')}" value="${escapeHtml(b.patientName)}">
          <input type="tel" class="edit-booking-phone" placeholder="${t('label_phone')}" value="${escapeHtml(b.patientPhone || '')}">
          <input type="date" class="edit-booking-date" value="${b.date}">
          <input type="time" class="edit-booking-time" value="${b.time}">
          <button type="button" class="btn-xs approve" data-action="save-booking-edit" data-id="${b.id}">${t('save_btn')}</button>
          <button type="button" class="btn-xs delete" data-action="cancel-booking-edit" data-id="${b.id}">${t('cancel_edit_btn')}</button>
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
    alert(t('booking_fields_required'));
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
    // نعيد الرسم فوراً بدل ما ننتظر وصول تحديث الاستماع الفوري (onSnapshot)،
    // عشان وضع التعديل يقفل مباشرة بمجرد الحفظ بدون تأخير محسوس
    renderBookingRequests();
    renderRejectedBookings();
    renderWeeklySchedule();
    renderUpcoming24h();
  } catch (err) {
    console.error('saveBookingEdit error:', err);
    alert(t('save_error'));
  }
}

function startBookingEdit(bookingId) {
  editingBookingId = bookingId;
  renderBookingRequests();
  renderRejectedBookings();
  renderWeeklySchedule();
  renderUpcoming24h();
}

function cancelBookingEdit() {
  editingBookingId = null;
  renderBookingRequests();
  renderRejectedBookings();
  renderWeeklySchedule();
  renderUpcoming24h();
}

// حذف حجز نهائياً - لو كان مقبول، نحرر قفل الوقت أيضاً
async function deleteBooking(bookingId) {
  const sure = confirm(t('confirm_delete_booking'));
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
    alert(t('delete_error'));
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
    clinicId: activeClinicUid,
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
// (قائمة قابلة للطي بدل كروت، عشان توفر مساحة)
// ============================================
let expandedDoctorId = null;

function renderDoctors() {
  const wrap = document.getElementById('doctors-wrap');

  if (cachedDoctors.length === 0) {
    wrap.innerHTML = `<p class="empty-state">${t('no_doctors_added')}</p>`;
    return;
  }

  wrap.innerHTML = `
    <div class="doctor-accordion">
      ${cachedDoctors.map((doc) => renderDoctorAccordionItem(doc)).join('')}
    </div>
  `;

  wrap.querySelectorAll('[data-action="toggle-doctor"]').forEach((el) => {
    el.addEventListener('click', () => {
      expandedDoctorId = expandedDoctorId === el.dataset.id ? null : el.dataset.id;
      renderDoctors();
    });
  });
  wrap.querySelectorAll('[data-action="print-doctor"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      printDoctorSchedule(btn.dataset.id);
    });
  });
  wrap.querySelectorAll('[data-action="edit-doctor"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      editingDoctorId = btn.dataset.id;
      expandedDoctorId = btn.dataset.id;
      renderDoctors();
    });
  });
  wrap.querySelectorAll('[data-action="cancel-doctor-edit"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      editingDoctorId = null;
      renderDoctors();
    });
  });
  wrap.querySelectorAll('[data-action="save-doctor-edit"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      saveDoctorEdit(btn.dataset.id);
    });
  });
  wrap.querySelectorAll('[data-action="delete-doctor"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteDoctor(btn.dataset.id);
    });
  });
  wrap.querySelectorAll('[data-action="remove-hour"]').forEach((btn) => {
    btn.addEventListener('click', () => removeWorkingHour(btn.dataset.id, Number(btn.dataset.index)));
  });
  wrap.querySelectorAll('[data-action="add-hour"]').forEach((btn) => {
    btn.addEventListener('click', () => addWorkingHour(btn.dataset.id));
  });
  wrap.querySelectorAll('[data-action="toggle-bulk"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const form = wrap.querySelector(`[data-bulk-for="${btn.dataset.id}"]`);
      if (form) form.classList.toggle('hidden');
    });
  });
  wrap.querySelectorAll('[data-action="submit-bulk"]').forEach((btn) => {
    btn.addEventListener('click', () => submitBulkHours(btn.dataset.id));
  });
  wrap.querySelectorAll('[data-action="disable-day"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      disableDoctorDay(btn.dataset.id);
    });
  });
}

// يحذف كل أوقات عمل الطبيب المسجّلة بتاريخ محدد دفعة وحدة (إجازة/يوم عطلة)
async function disableDoctorDay(doctorId) {
  const row = document.querySelector(`[data-disable-day-for="${doctorId}"]`);
  const dateVal = row.querySelector('.disable-day-date').value;

  if (!dateVal) {
    alert(t('select_date_first'));
    return;
  }

  const doctor = cachedDoctors.find((d) => d.id === doctorId);
  const existing = doctor.workingHours || [];
  const remaining = existing.filter((h) => h.date !== dateVal);

  if (remaining.length === existing.length) {
    alert(t('no_hours_this_date'));
    return;
  }

  const sure = confirm(t('confirm_disable_doctor_day', dateVal));
  if (!sure) return;

  await db.collection('doctors').doc(doctorId).update({ workingHours: remaining });
  loadDashboard();
}

// يعطّل يوم كامل لكل أطباء العيادة مرة وحدة (عطلة رسمية مثلاً)
async function disableClinicWideDay() {
  const dateVal = document.getElementById('clinic-wide-disable-date').value;

  if (!dateVal) {
    alert(t('select_date_first'));
    return;
  }

  const affectedDoctors = cachedDoctors.filter((d) => (d.workingHours || []).some((h) => h.date === dateVal));

  if (affectedDoctors.length === 0) {
    alert(t('no_doctors_on_date'));
    return;
  }

  const sure = confirm(t('confirm_disable_clinic_day', affectedDoctors.length, dateVal));
  if (!sure) return;

  const btn = document.getElementById('clinic-wide-disable-btn');
  btn.disabled = true;
  btn.textContent = t('disabling');

  try {
    await Promise.all(affectedDoctors.map((d) => {
      const remaining = (d.workingHours || []).filter((h) => h.date !== dateVal);
      return db.collection('doctors').doc(d.id).update({ workingHours: remaining });
    }));
    loadDashboard();
  } catch (err) {
    console.error('disableClinicWideDay error:', err);
    alert(t('disable_error'));
  } finally {
    btn.disabled = false;
    btn.textContent = t('clinic_wide_disable_btn');
  }
}

const clinicWideDisableBtn = document.getElementById('clinic-wide-disable-btn');
if (clinicWideDisableBtn) {
  clinicWideDisableBtn.addEventListener('click', disableClinicWideDay);
}

// يضيف أوقات عمل لعدة تواريخ دفعة وحدة (نطاق تاريخ + أيام أسبوع مختارة)
async function submitBulkHours(doctorId) {
  const form = document.querySelector(`[data-bulk-for="${doctorId}"]`);
  const fromDate = form.querySelector('.bulk-from-date').value;
  const toDate = form.querySelector('.bulk-to-date').value;
  const start = form.querySelector('.bulk-start').value;
  const end = form.querySelector('.bulk-end').value;
  const selectedWeekdays = [...form.querySelectorAll('.bulk-weekday:checked')].map((cb) => cb.value);

  if (!fromDate || !toDate || fromDate > toDate) {
    alert(t('bulk_date_order_error'));
    return;
  }
  if (selectedWeekdays.length === 0) {
    alert(t('bulk_weekday_required'));
    return;
  }
  if (!start || !end || start >= end) {
    alert(t('time_order_error'));
    return;
  }

  const rangeDays = (new Date(toDate) - new Date(fromDate)) / (1000 * 60 * 60 * 24);
  if (rangeDays > 180) {
    alert(t('bulk_range_too_long'));
    return;
  }

  const doctor = cachedDoctors.find((d) => d.id === doctorId);
  const existing = doctor.workingHours || [];
  const existingKeys = new Set(existing.map((h) => `${h.date}_${h.start}_${h.end}`));
  const newEntries = [];

  let cursor = new Date(fromDate + 'T00:00:00');
  const endDate = new Date(toDate + 'T00:00:00');
  while (cursor <= endDate) {
    const dayKey = DAYS[cursor.getDay()].key;
    if (selectedWeekdays.includes(dayKey)) {
      const dateISO = cursor.toISOString().slice(0, 10);
      const entryKey = `${dateISO}_${start}_${end}`;
      if (!existingKeys.has(entryKey)) {
        newEntries.push({ date: dateISO, start, end });
        existingKeys.add(entryKey);
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  if (newEntries.length === 0) {
    alert(t('bulk_no_new_dates'));
    return;
  }

  const sure = confirm(t('confirm_bulk_add', newEntries.length));
  if (!sure) return;

  await db.collection('doctors').doc(doctorId).update({
    workingHours: [...existing, ...newEntries],
  });
  loadDashboard();
}

function renderDoctorAccordionItem(doc) {
  const isExpanded = doc.id === expandedDoctorId;
  const isEditing = doc.id === editingDoctorId;

  const avatarStyle = doc.photoUrl
    ? `background-image:url('${doc.photoUrl}')`
    : `background:${stringToColor(doc.name)}`;

  return `
    <div class="doctor-item ${isExpanded ? 'expanded' : ''}">
      <div class="doctor-item-header" data-action="toggle-doctor" data-id="${doc.id}">
        <div class="doctor-item-info">
          <span class="doctor-item-avatar" style="${avatarStyle}">${doc.photoUrl ? '' : escapeHtml((doc.name || '؟').trim().slice(0, 1))}</span>
          <div class="doctor-item-text">
            <span class="doctor-item-name">${escapeHtml(doc.name)}</span>
            <span class="doctor-item-specialty">${escapeHtml(doc.specialty)}</span>
          </div>
        </div>
        <div class="doctor-item-actions">
          <button class="btn-xs toggle" data-action="print-doctor" data-id="${doc.id}" title="${t('print_doctor_title')}">🖨️</button>
          <button class="btn-xs toggle" data-action="edit-doctor" data-id="${doc.id}">✏️</button>
          <button class="btn-xs delete" data-action="delete-doctor" data-id="${doc.id}">🗑️</button>
          <span class="doctor-item-arrow">${isExpanded ? '▲' : '▼'}</span>
        </div>
      </div>
      <div class="doctor-item-body ${isExpanded ? '' : 'hidden'}">
        ${isEditing ? `
          <div class="mini-form" style="margin-bottom:14px; align-items:center;">
            <input type="text" class="edit-doctor-name" placeholder="${t('add_doctor_name_label')}" value="${escapeHtml(doc.name)}">
            <input type="text" class="edit-doctor-specialty" placeholder="${t('add_doctor_specialty_label')}" value="${escapeHtml(doc.specialty)}">
            <select class="edit-doctor-slot-minutes" title="${t('slot_duration_label')}">
              ${[10, 15, 20, 30, 45, 60].map((m) => `<option value="${m}" ${(doc.slotMinutes || 20) === m ? 'selected' : ''}>${m} ${t('minutes_suffix')}</option>`).join('')}
            </select>
          </div>
          <div class="mini-form" style="margin-bottom:14px;">
            <input type="file" accept="image/*" class="edit-doctor-photo" data-id="${doc.id}">
            <button type="button" class="btn-xs approve" data-action="save-doctor-edit" data-id="${doc.id}">${t('save_btn')}</button>
            <button type="button" class="btn-xs delete" data-action="cancel-doctor-edit" data-id="${doc.id}">${t('cancel_edit_btn')}</button>
          </div>
          <p class="cell-sub" style="margin:-6px 0 14px;">${t('photo_upload_hint')}</p>
        ` : ''}
        ${renderDoctorHoursSection(doc)}
      </div>
    </div>
  `;
}

function renderDoctorHoursSection(doc) {
  return `
    <div class="hours-list">
      ${(doc.workingHours || []).length === 0
        ? `<span class="cell-sub">${t('no_hours_set')}</span>`
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
      <button type="button" class="btn-xs toggle" data-action="add-hour" data-id="${doc.id}">${t('add_hour_btn')}</button>
      <button type="button" class="btn-xs approve" data-action="toggle-bulk" data-id="${doc.id}">${t('bulk_add_toggle')}</button>
    </div>

    <div class="disable-day-row" data-disable-day-for="${doc.id}">
      <input type="date" class="disable-day-date">
      <button type="button" class="btn-xs delete" data-action="disable-day" data-id="${doc.id}">${t('disable_day_btn')}</button>
    </div>

    <div class="bulk-hours-form hidden" data-bulk-for="${doc.id}">
      <p class="bulk-hours-title">${t('bulk_add_title')}</p>
      <div class="mini-form">
        <div class="field">
          <label>${t('bulk_from_date')}</label>
          <input type="date" class="bulk-from-date">
        </div>
        <div class="field">
          <label>${t('bulk_to_date')}</label>
          <input type="date" class="bulk-to-date">
        </div>
      </div>
      <div class="bulk-weekdays">
        ${DAYS.map((d) => `
          <label class="bulk-weekday-label">
            <input type="checkbox" class="bulk-weekday" value="${d.key}"> ${d.label}
          </label>
        `).join('')}
      </div>
      <div class="mini-form">
        <input type="time" class="bulk-start" value="09:00">
        <input type="time" class="bulk-end" value="14:00">
        <button type="button" class="btn-xs approve" data-action="submit-bulk" data-id="${doc.id}">${t('bulk_submit_btn')}</button>
      </div>
    </div>
  `;
}

// حفظ اسم وتخصص الطبيب (وصورته لو رفعت جديدة) مع بعض
// ملاحظة: ما يحدّث اسم الطبيب بالحجوزات القديمة المخزّنة مسبقاً (doctorName)، بس الجديدة بتاخذ الاسم المحدّث
async function saveDoctorEdit(doctorId) {
  const card = document.querySelector(`[data-action="save-doctor-edit"][data-id="${doctorId}"]`).closest('.doctor-item');
  const name = card.querySelector('.edit-doctor-name').value.trim();
  const specialty = card.querySelector('.edit-doctor-specialty').value.trim();
  const slotMinutes = parseInt(card.querySelector('.edit-doctor-slot-minutes').value, 10);
  const fileInput = card.querySelector('.edit-doctor-photo');
  const file = fileInput && fileInput.files[0];

  if (!name || !specialty) {
    alert(t('doctor_name_specialty_required'));
    return;
  }

  if (file) {
    if (!file.type.startsWith('image/')) {
      alert(t('file_must_be_image'));
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      alert(t('image_too_large_3mb'));
      return;
    }
  }

  const saveBtn = card.querySelector('[data-action="save-doctor-edit"]');
  saveBtn.disabled = true;
  saveBtn.textContent = t('saving');

  try {
    const updates = { name, specialty, slotMinutes };

    if (file) {
      const storagePath = `doctors/${doctorId}_${Date.now()}.jpg`;
      const ref = storage.ref(storagePath);
      await ref.put(file);
      updates.photoUrl = await ref.getDownloadURL();
    }

    await db.collection('doctors').doc(doctorId).update(updates);
    editingDoctorId = null;
    loadDashboard();
  } catch (err) {
    console.error('saveDoctorEdit error:', err);
    alert(t('save_error'));
    saveBtn.disabled = false;
    saveBtn.textContent = t('save_btn');
  }
}

async function deleteDoctor(doctorId) {
  const sure = confirm(t('confirm_delete_doctor'));
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
    alert(t('select_date_required'));
    return;
  }

  if (!start || !end || start >= end) {
    alert(t('time_order_error'));
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
// الجدول الأسبوعي (المواعيد المقبولة) + فلترة حقيقية + طباعة
// ============================================
let scheduleFilters = { doctorId: '', date: '', time: '' };
let lastScheduleBookings = [];

document.getElementById('filter-doctor-select').addEventListener('change', (e) => {
  scheduleFilters.doctorId = e.target.value;
  renderWeeklySchedule();
  renderUpcoming24h();
});
document.getElementById('filter-date-input').addEventListener('change', (e) => {
  scheduleFilters.date = e.target.value;
  renderWeeklySchedule();
  renderUpcoming24h();
});
document.getElementById('filter-time-input').addEventListener('change', (e) => {
  scheduleFilters.time = e.target.value;
  renderWeeklySchedule();
  renderUpcoming24h();
});
document.getElementById('clear-schedule-filters').addEventListener('click', () => {
  scheduleFilters = { doctorId: '', date: '', time: '' };
  document.getElementById('filter-doctor-select').value = '';
  document.getElementById('filter-date-input').value = '';
  document.getElementById('filter-time-input').value = '';
  renderWeeklySchedule();
  renderUpcoming24h();
});
document.getElementById('print-week-btn').addEventListener('click', printCurrentSchedule);

// يحدّث قائمة الأطباء بفلتر الجدول الأسبوعي (يُستدعى كل ما نحمّل الأطباء)
function populateDoctorFilterOptions() {
  const select = document.getElementById('filter-doctor-select');
  const currentValue = select.value;
  select.innerHTML = `<option value="">${t('filter_all_doctors')}</option>` +
    cachedDoctors.map((d) => `<option value="${d.id}">${escapeHtml(d.name)}</option>`).join('');
  if ([...select.options].some((o) => o.value === currentValue)) {
    select.value = currentValue;
  }
}

function renderWeeklySchedule() {
  const wrap = document.getElementById('schedule-wrap');
  let accepted = cachedBookings.filter((b) => b.status === 'accepted');

  // بدون فلتر تاريخ محدد: نعرض هذا الأسبوع بس (السلوك الافتراضي)
  // مع فلتر تاريخ محدد: نبحث بذاك التاريخ بالضبط، حتى لو خارج هذا الأسبوع
  if (scheduleFilters.date) {
    accepted = accepted.filter((b) => b.date === scheduleFilters.date);
  } else {
    const weekIsoSet = new Set(getWeekDates().map((d) => d.iso));
    accepted = accepted.filter((b) => weekIsoSet.has(b.date));
  }

  if (scheduleFilters.doctorId) accepted = accepted.filter((b) => b.doctorId === scheduleFilters.doctorId);
  if (scheduleFilters.time) accepted = accepted.filter((b) => b.time === scheduleFilters.time);

  accepted.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time) || a.doctorName.localeCompare(b.doctorName, 'ar'));
  lastScheduleBookings = accepted;

  if (accepted.length === 0) {
    wrap.innerHTML = `<p class="empty-state">${t('no_matching_appts')}</p>`;
    return;
  }

  // نخفي عمود الطبيب لو مفلتر لطبيب واحد بس (عشان ما يتكرر بلا فايدة)
  const showDoctor = !scheduleFilters.doctorId;
  wrap.innerHTML = scheduleTableHtml(accepted, { showDate: true, showDoctor });
  bindScheduleRowEvents(wrap);
}

// المواعيد القادمة خلال 24 ساعة: اليوم + بكرة مع بعض
// (يعني موعد تاريخه بكرة يظهر هنا من اليوم، عشان العيادة ترسل تذكير مبكر)
function renderUpcoming24h() {
  const wrap = document.getElementById('upcoming24h-wrap');
  if (!wrap) return;

  const todayStr = todayISO();
  const tomorrowStr = addDaysISO(todayStr, 1);

  const upcoming = cachedBookings
    .filter((b) => b.status === 'accepted' && (b.date === todayStr || b.date === tomorrowStr))
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));

  if (upcoming.length === 0) {
    wrap.innerHTML = `<p class="empty-state">${t('no_upcoming24')}</p>`;
    return;
  }

  wrap.innerHTML = scheduleTableHtml(upcoming, { showDate: true, showDoctor: true });
  bindScheduleRowEvents(wrap);
}

function addDaysISO(iso, days) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// جدول موحّد يبني الأعمدة حسب طريقة العرض (يضيف/يحذف عمود الطبيب)
function scheduleTableHtml(bookings, opts) {
  const colCount = 4 + (opts.showDate ? 1 : 0) + (opts.showDoctor ? 1 : 0);
  const heads = [t('col_time')];
  if (opts.showDate) heads.push(t('col_date'));
  heads.push(t('col_patient'), t('col_booking_number'));
  if (opts.showDoctor) heads.push(t('col_doctor'));
  heads.push(t('col_contact'), t('col_action'));

  return `
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr>${heads.map((h) => `<th>${h}</th>`).join('')}</tr></thead>
        <tbody>
          ${bookings.map((b) => (b.id === editingBookingId ? renderBookingEditRow(b, colCount) : scheduleRowHtml(b, opts))).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function scheduleRowHtml(b, opts) {
  const cells = [`<td class="cell-sub">${b.time}</td>`];
  if (opts.showDate) cells.push(`<td class="cell-sub">${b.date}</td>`);
  cells.push(`
    <td class="cell-name">
      ${escapeHtml(b.patientName)}
      ${b.caseDescription ? `<p class="case-description" title="${escapeHtml(b.caseDescription)}">📝 ${escapeHtml(b.caseDescription)}</p>` : ''}
    </td>
  `);
  cells.push(`<td class="cell-sub">${bookingNumber(b.id)}</td>`);
  if (opts.showDoctor) cells.push(`<td>${escapeHtml(b.doctorName)}</td>`);
  cells.push(`
    <td>
      ${b.patientPhone
        ? `<a class="btn-xs whatsapp" href="${buildWhatsAppLink(b)}" target="_blank" rel="noopener">${t('whatsapp_btn')}</a>`
        : '<span class="cell-sub">—</span>'}
    </td>
  `);

  const isPastOrToday = b.date <= todayISO();

  cells.push(`
    <td>
      <div class="row-actions">
        ${b.patientPhone
          ? `<a class="btn-xs toggle" href="${buildReminderLink(b)}" target="_blank" rel="noopener" title="${t('reminder_btn')}">${t('reminder_btn')}</a>`
          : ''}
        ${isPastOrToday
          ? `<button class="btn-xs reject" data-action="mark-no-show" data-id="${b.id}" title="${t('no_show_btn')}">${t('no_show_btn')}</button>`
          : ''}
        <button class="btn-xs toggle" data-action="edit-schedule" data-id="${b.id}">✏️</button>
        <button class="btn-xs delete" data-action="delete-schedule" data-id="${b.id}">🗑️</button>
      </div>
    </td>
  `);
  return `<tr>${cells.join('')}</tr>`;
}

function bindScheduleRowEvents(wrap) {
  wrap.querySelectorAll('[data-action="edit-schedule"]').forEach((btn) => {
    btn.addEventListener('click', () => startBookingEdit(btn.dataset.id));
  });
  wrap.querySelectorAll('[data-action="delete-schedule"]').forEach((btn) => {
    btn.addEventListener('click', () => deleteBooking(btn.dataset.id));
  });
  wrap.querySelectorAll('[data-action="mark-no-show"]').forEach((btn) => {
    btn.addEventListener('click', () => markNoShow(btn.dataset.id));
  });
  wrap.querySelectorAll('[data-action="cancel-booking-edit"]').forEach((btn) => {
    btn.addEventListener('click', cancelBookingEdit);
  });
  wrap.querySelectorAll('[data-action="save-booking-edit"]').forEach((btn) => {
    btn.addEventListener('click', () => saveBookingEdit(btn.dataset.id));
  });
}

// تعليم حجز مؤكد بأنه "لم يحضر" (منفصل عن الرفض، يفيد بتتبع المرضى المتكررين بالغياب)
async function markNoShow(bookingId) {
  const sure = confirm(t('confirm_no_show'));
  if (!sure) return;

  try {
    await db.collection('bookings').doc(bookingId).update({ status: 'no_show' });
  } catch (err) {
    console.error('markNoShow error:', err);
    alert(t('save_error'));
  }
}

// رسالة تذكير واتساب منفصلة عن رسالة تأكيد الحجز الأصلية
function buildReminderLink(booking) {
  const message = [
    `السلام عليكم ${booking.patientName}،`,
    ``,
    `تذكير بموعدكم غداً/اليوم بخصوص الحجز رقم ${bookingNumber(booking.id)}`,
    `📅 التاريخ: ${booking.date}`,
    `🕐 الوقت: ${booking.time}`,
    ``,
    `نتطلع لزيارتكم، ولأي تعديل أو إلغاء نحن بخدمتكم.`,
    ``,
    `مع تحيات إدارة ${clinicName}`,
  ].join('\n');

  return `https://wa.me/${sanitizePhone(booking.patientPhone)}?text=${encodeURIComponent(message)}`;
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
// طباعة / استخراج PDF (عن طريق نافذة طباعة المتصفح - اختر "حفظ كـ PDF")
// ============================================
function printDoctorSchedule(doctorId) {
  const doctor = cachedDoctors.find((d) => d.id === doctorId);
  if (!doctor) return;

  const weekDates = getWeekDates();
  const weekIsoSet = new Set(weekDates.map((d) => d.iso));
  const bookings = cachedBookings
    .filter((b) => b.status === 'accepted' && b.doctorId === doctorId && weekIsoSet.has(b.date))
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));

  renderPrintArea({
    title: `جدول د. ${doctor.name} — ${doctor.specialty}`,
    subtitle: `عيادة ${clinicName} — الأسبوع من ${weekDates[0].iso} إلى ${weekDates[6].iso}`,
    bookings,
    showDoctor: false,
  });

  window.print();
}

function printCurrentSchedule() {
  const filterParts = [];
  if (scheduleFilters.doctorId) {
    const doc = cachedDoctors.find((d) => d.id === scheduleFilters.doctorId);
    if (doc) filterParts.push(`الطبيب: ${doc.name}`);
  }
  if (scheduleFilters.date) filterParts.push(`التاريخ: ${scheduleFilters.date}`);
  if (scheduleFilters.time) filterParts.push(`الوقت: ${scheduleFilters.time}`);

  const subtitle = filterParts.length > 0
    ? `عيادة ${clinicName} — فلتر: ${filterParts.join(' | ')}`
    : `عيادة ${clinicName} — جدول هذا الأسبوع`;

  renderPrintArea({
    title: 'جدول المواعيد',
    subtitle,
    bookings: lastScheduleBookings,
    showDoctor: !scheduleFilters.doctorId,
  });

  window.print();
}

function renderPrintArea({ title, subtitle, bookings, showDoctor }) {
  const area = document.getElementById('print-area');

  if (bookings.length === 0) {
    area.innerHTML = `
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(subtitle)}</p>
      <p>${t('no_confirmed_this_week')}</p>
    `;
    return;
  }

  area.innerHTML = `
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(subtitle)}</p>
    <table class="print-table">
      <thead>
        <tr>
          <th>${t('col_date')}</th>
          <th>${t('col_time')}</th>
          <th>${t('col_patient')}</th>
          ${showDoctor ? `<th>${t('col_doctor')}</th>` : ''}
          <th>${t('col_booking_number')}</th>
        </tr>
      </thead>
      <tbody>
        ${bookings.map((b) => `
          <tr>
            <td>${b.date}</td>
            <td>${b.time}</td>
            <td>${escapeHtml(b.patientName)}</td>
            ${showDoctor ? `<td>${escapeHtml(b.doctorName)}</td>` : ''}
            <td>${bookingNumber(b.id)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
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
    wrap.innerHTML = `<p class="empty-state">${query ? t('no_patients_match') : t('no_patients_registered')}</p>`;
    return;
  }

  wrap.innerHTML = `
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>${t('col_patient')}</th>
            <th>${t('col_phone')}</th>
            <th>${t('stat_total_bookings')}</th>
            <th>${t('col_last_visit')}</th>
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

const AVATAR_COLORS = ['#158A7E', '#0F2440', '#1C6B93', '#2E9E6D', '#4A7A9E', '#0E7A72'];
function stringToColor(name) {
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
// إدارة الموظفين (لصاحب حساب العيادة الأساسي بس)
// ============================================
let cachedStaff = [];

const addStaffForm = document.getElementById('add-staff-form');
if (addStaffForm) {
  addStaffForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const name = document.getElementById('new-staff-name').value.trim();
    const email = document.getElementById('new-staff-email').value.trim();
    const password = document.getElementById('new-staff-password').value;

    if (!name || !email || password.length < 6) {
      alert(t('staff_fields_required'));
      return;
    }

    const submitBtn = addStaffForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = t('adding');

    try {
      await addStaffMember(name, email, password);
      addStaffForm.reset();
      loadStaffList();
    } catch (err) {
      console.error('addStaffMember error:', err);
      const messages = {
        'auth/email-already-in-use': t('err_email_in_use'),
        'auth/invalid-email': t('err_invalid_email'),
        'auth/weak-password': t('err_weak_password'),
      };
      alert(messages[err.code] || t('add_staff_error'));
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = t('add_staff_btn');
    }
  });
}

// ننشئ حساب الموظف عن طريق تطبيق Firebase ثانوي منفصل،
// عشان إنشاء الحساب الجديد ما يسجّل خروج العيادة الحالية تلقائياً
async function addStaffMember(name, email, password) {
  let secondaryApp = firebase.apps.find((a) => a.name === 'Secondary');
  if (!secondaryApp) {
    secondaryApp = firebase.initializeApp(firebaseConfig, 'Secondary');
  }
  const secondaryAuth = secondaryApp.auth();

  const cred = await secondaryAuth.createUserWithEmailAndPassword(email, password);
  const staffUid = cred.user.uid;

  await db.collection('users').doc(staffUid).set({
    name,
    email,
    role: 'staff',
    status: 'active',
    staffOf: currentUid,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
  });

  await secondaryAuth.signOut();
}

async function loadStaffList() {
  const snap = await db.collection('users')
    .where('staffOf', '==', currentUid)
    .where('role', '==', 'staff')
    .get();

  cachedStaff = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  renderStaffList();
}

function renderStaffList() {
  const wrap = document.getElementById('staff-wrap');
  if (!wrap) return;

  if (cachedStaff.length === 0) {
    wrap.innerHTML = `<p class="empty-state">${t('no_staff_added')}</p>`;
    return;
  }

  wrap.innerHTML = `
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>${t('label_name')}</th>
            <th>${t('label_email')}</th>
            <th>${t('col_status')}</th>
            <th>${t('col_action')}</th>
          </tr>
        </thead>
        <tbody>
          ${cachedStaff.map((s) => `
            <tr>
              <td class="cell-name">${escapeHtml(s.name)}</td>
              <td class="cell-sub">${escapeHtml(s.email)}</td>
              <td>${staffStatusBadge(s.status)}</td>
              <td>
                <button class="btn-xs toggle" data-action="reset-staff-password" data-email="${escapeHtml(s.email)}">${t('reset_password_btn')}</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;

  wrap.querySelectorAll('[data-action="reset-staff-password"]').forEach((btn) => {
    btn.addEventListener('click', () => resetStaffPassword(btn.dataset.email));
  });
}

// يرسل بريد إعادة تعيين كلمة المرور للموظف (رابط آمن، ما يكشف كلمة المرور لأحد)
async function resetStaffPassword(email) {
  const sure = confirm(t('confirm_reset_password', email));
  if (!sure) return;

  try {
    await auth.sendPasswordResetEmail(email);
    alert(t('reset_password_sent'));
  } catch (err) {
    console.error('resetStaffPassword error:', err);
    alert(t('reset_password_error'));
  }
}

function staffStatusBadge(status) {
  const labels = { active: t('status_active'), disabled: t('status_disabled') };
  const cls = { active: 'badge-active', disabled: 'badge-disabled' };
  return `<span class="badge ${cls[status] || ''}">${labels[status] || status}</span>`;
}

// ============================================
// الإحصائيات (Analytics)
// ============================================
let doctorsChart = null;
let hoursChart = null;
let patientsChart = null;

function renderAnalytics() {
  const emptyEl = document.getElementById('analytics-empty');
  const contentEl = document.getElementById('analytics-content');
  if (!emptyEl || !contentEl) return;

  if (cachedBookings.length === 0) {
    emptyEl.classList.remove('hidden');
    contentEl.classList.add('hidden');
    return;
  }
  emptyEl.classList.add('hidden');
  contentEl.classList.remove('hidden');

  const total = cachedBookings.length;
  const negativeCount = cachedBookings.filter((b) => ['rejected', 'cancelled', 'no_show'].includes(b.status)).length;
  const cancelRate = total > 0 ? Math.round((negativeCount / total) * 100) : 0;

  // أكثر طبيب مطلوب
  const doctorCounts = {};
  cachedBookings.forEach((b) => {
    doctorCounts[b.doctorName] = (doctorCounts[b.doctorName] || 0) + 1;
  });
  const sortedDoctors = Object.entries(doctorCounts).sort((a, b) => b[1] - a[1]);

  // أكثر الأوقات ازدحاماً (بالساعة)
  const hourCounts = {};
  cachedBookings.forEach((b) => {
    const hour = b.time.split(':')[0];
    hourCounts[hour] = (hourCounts[hour] || 0) + 1;
  });
  const sortedHoursByCount = Object.entries(hourCounts).sort((a, b) => b[1] - a[1]);
  const sortedHoursByTime = Object.entries(hourCounts).sort((a, b) => a[0].localeCompare(b[0]));

  // مرضى جدد لكل شهر (آخر 6 أشهر) - حسب أول حجز لكل مريض
  const firstBookingMsByPatient = {};
  cachedBookings.forEach((b) => {
    if (!b.createdAt) return;
    const ms = b.createdAt.toMillis();
    if (!firstBookingMsByPatient[b.patientId] || ms < firstBookingMsByPatient[b.patientId]) {
      firstBookingMsByPatient[b.patientId] = ms;
    }
  });
  const monthBuckets = buildLast6MonthBuckets();
  Object.values(firstBookingMsByPatient).forEach((ms) => {
    const d = new Date(ms);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (key in monthBuckets) monthBuckets[key] += 1;
  });

  document.getElementById('stat-total-bookings').textContent = total;
  document.getElementById('stat-top-doctor').textContent = sortedDoctors[0] ? sortedDoctors[0][0] : '—';
  document.getElementById('stat-top-hour').textContent = sortedHoursByCount[0] ? formatHourLabel(sortedHoursByCount[0][0]) : '—';
  document.getElementById('stat-cancel-rate').textContent = `${cancelRate}%`;

  if (typeof Chart !== 'undefined') {
    drawDoctorsChart(sortedDoctors.slice(0, 6));
    drawHoursChart(sortedHoursByTime);
    drawPatientsChart(monthBuckets);
  }
}

function drawDoctorsChart(entries) {
  const canvas = document.getElementById('chart-doctors');
  if (!canvas) return;
  if (doctorsChart) doctorsChart.destroy();
  doctorsChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: entries.map((e) => e[0]),
      datasets: [{ label: t('stat_total_bookings'), data: entries.map((e) => e[1]), backgroundColor: '#158A7E', borderRadius: 6 }],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
    },
  });
}

function drawHoursChart(entries) {
  const canvas = document.getElementById('chart-hours');
  if (!canvas) return;
  if (hoursChart) hoursChart.destroy();
  hoursChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: entries.map((e) => formatHourLabel(e[0])),
      datasets: [{ label: t('stat_total_bookings'), data: entries.map((e) => e[1]), backgroundColor: '#4ED9C4', borderRadius: 6 }],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
    },
  });
}

function drawPatientsChart(buckets) {
  const canvas = document.getElementById('chart-patients-monthly');
  if (!canvas) return;
  if (patientsChart) patientsChart.destroy();
  const keys = Object.keys(buckets);
  patientsChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels: keys.map(formatMonthLabel),
      datasets: [{
        label: t('chart_new_patients'),
        data: keys.map((k) => buckets[k]),
        borderColor: '#0F2440',
        backgroundColor: 'rgba(21,138,126,0.15)',
        fill: true,
        tension: 0.3,
      }],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
    },
  });
}

function buildLast6MonthBuckets() {
  const buckets = {};
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    buckets[key] = 0;
  }
  return buckets;
}

function formatHourLabel(hourStr) {
  const h = parseInt(hourStr, 10);
  if (currentLang === 'en') {
    const period = h < 12 ? 'AM' : 'PM';
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12} ${period}`;
  }
  const period = h < 12 ? 'ص' : 'م';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12} ${period}`;
}

function formatMonthLabel(key) {
  const monthsAr = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  const monthsEn = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const months = currentLang === 'en' ? monthsEn : monthsAr;
  const m = parseInt(key.split('-')[1], 10);
  return months[m - 1];
}

// ============================================
// تصدير الحجوزات كملف CSV (يفتح مباشرة بـ Excel)
// ============================================
const exportCsvBtn = document.getElementById('export-csv-btn');
if (exportCsvBtn) {
  exportCsvBtn.addEventListener('click', exportBookingsCSV);
}

function exportBookingsCSV() {
  const statusLabels = {
    pending: t('status_pending'),
    accepted: t('status_accepted'),
    rejected: t('status_rejected'),
    cancelled: t('status_cancelled'),
    no_show: t('status_no_show'),
  };
  const headers = [t('col_booking_number'), t('col_patient'), t('col_phone'), t('col_doctor'), t('col_date'), t('col_time'), t('col_status')];

  const rows = [...cachedBookings]
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
    .map((b) => [
      bookingNumber(b.id),
      b.patientName,
      b.patientPhone || '',
      b.doctorName,
      b.date,
      b.time,
      statusLabels[b.status] || b.status,
    ]);

  const csvContent = [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  // نضيف BOM بالبداية عشان Excel يقرأ الحروف العربية صح
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `حجوزات-${clinicName}-${todayISO()}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

// ============================================
// شعار العيادة
// ============================================
async function loadClinicLogo() {
  const preview = document.getElementById('clinic-logo-preview');
  if (!preview) return;

  renderBookingLink();

  try {
    const doc = await db.collection('users').doc(activeClinicUid).get();
    const data = doc.exists ? doc.data() : {};

    renderLogoPreview(data.logoUrl);

    const whatsappInput = document.getElementById('clinic-whatsapp');
    const addressInput = document.getElementById('clinic-address');
    const websiteInput = document.getElementById('clinic-website');
    const instagramInput = document.getElementById('clinic-instagram');

    if (whatsappInput) whatsappInput.value = data.whatsapp || '';
    if (addressInput) addressInput.value = data.address || '';
    if (websiteInput) websiteInput.value = data.website || '';
    if (instagramInput) instagramInput.value = data.instagram || '';
  } catch (err) {
    console.error('loadClinicLogo error:', err);
  }
}

function renderLogoPreview(logoUrl) {
  const preview = document.getElementById('clinic-logo-preview');
  if (logoUrl) {
    preview.style.backgroundImage = `url('${logoUrl}')`;
    preview.textContent = '';
  } else {
    preview.style.backgroundImage = 'none';
    preview.style.background = stringToColor(clinicName);
    preview.textContent = (clinicName || '؟').trim().slice(0, 1);
  }
}

const uploadLogoBtn = document.getElementById('upload-logo-btn');
if (uploadLogoBtn) {
  uploadLogoBtn.addEventListener('click', async () => {
    const fileInput = document.getElementById('clinic-logo-input');
    const file = fileInput.files[0];

    if (!file) {
      alert(t('select_image_first'));
      return;
    }
    if (!file.type.startsWith('image/')) {
      alert(t('file_must_be_image'));
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      alert(t('image_too_large_3mb'));
      return;
    }

    uploadLogoBtn.disabled = true;
    uploadLogoBtn.textContent = t('uploading');

    try {
      const storagePath = `clinics/${activeClinicUid}_${Date.now()}.jpg`;
      const ref = storage.ref(storagePath);
      await ref.put(file);
      const logoUrl = await ref.getDownloadURL();

      await db.collection('users').doc(activeClinicUid).update({ logoUrl });

      renderLogoPreview(logoUrl);
      fileInput.value = '';
      alert(t('logo_uploaded_success'));
    } catch (err) {
      console.error('upload logo error:', err);
      alert(t('logo_upload_error'));
    } finally {
      uploadLogoBtn.disabled = false;
      uploadLogoBtn.textContent = t('upload_logo_btn');
    }
  });
}

const clinicInfoForm = document.getElementById('clinic-info-form');
if (clinicInfoForm) {
  clinicInfoForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const whatsapp = document.getElementById('clinic-whatsapp').value.trim();
    const address = document.getElementById('clinic-address').value.trim();
    const website = document.getElementById('clinic-website').value.trim();
    const instagram = document.getElementById('clinic-instagram').value.trim();

    const saveBtn = document.getElementById('save-clinic-info-btn');
    saveBtn.disabled = true;
    saveBtn.textContent = t('saving');

    try {
      await db.collection('users').doc(activeClinicUid).update({ whatsapp, address, website, instagram });
      alert(t('clinic_info_saved'));
    } catch (err) {
      console.error('save clinic info error:', err);
      alert(t('save_error'));
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = t('save_clinic_info_btn');
    }
  });
}

// ============================================
// رابط الحجز المباشر + رمز QR
// ============================================
function renderBookingLink() {
  const linkInput = document.getElementById('booking-link-input');
  const qrImg = document.getElementById('booking-qr-img');
  if (!linkInput || !qrImg) return;

  // بناء رابط نسبي لصفحة تسجيل الدخول، عشان يشتغل صح مهما كان الدومين (مخصص أو GitHub Pages بمسار فرعي)
  const url = new URL('../login.html', window.location.href);
  url.searchParams.set('clinic', activeClinicUid);
  const bookingLink = url.href;

  linkInput.value = bookingLink;
  qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(bookingLink)}`;
}

const copyBookingLinkBtn = document.getElementById('copy-booking-link-btn');
if (copyBookingLinkBtn) {
  copyBookingLinkBtn.addEventListener('click', async () => {
    const linkInput = document.getElementById('booking-link-input');
    try {
      await navigator.clipboard.writeText(linkInput.value);
      copyBookingLinkBtn.textContent = t('copied_label');
      setTimeout(() => { copyBookingLinkBtn.textContent = t('copy_link_btn'); }, 1800);
    } catch (err) {
      linkInput.select();
      document.execCommand('copy');
    }
  });
}

// لما تتبدّل اللغة، نعيد رسم كل قسم فيه محتوى حي بدون إعادة تحميل من القاعدة
function onLanguageChanged() {
  renderDoctors();
  renderBookingRequests();
  renderRejectedBookings();
  renderWeeklySchedule();
  renderUpcoming24h();
  renderAnalytics();
  if (isPrimaryOwner) renderStaffList();

  const patientSearchInput = document.getElementById('patient-search');
  if (patientSearchInput) renderPatientSearch(patientSearchInput.value.trim());
}

initPageTabs();
