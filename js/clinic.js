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
    clinicName = userData.name || 'العيادة';
  } else {
    // موظف: نجيب اسم العيادة الأساسية من حساب صاحبها
    activeClinicUid = userData.staffOf;
    const ownerDoc = await db.collection('users').doc(activeClinicUid).get();
    clinicName = ownerDoc.exists ? (ownerDoc.data().name || 'العيادة') : 'العيادة';
  }

  document.getElementById('clinic-name').textContent = userData.name || clinicName;

  const staffIndicator = document.getElementById('staff-indicator');
  if (!isPrimaryOwner && staffIndicator) {
    staffIndicator.textContent = ` (موظف لدى ${clinicName})`;
    staffIndicator.classList.remove('hidden');
  }

  // قسم "الموظفين" يظهر بس لصاحب الحساب الأساسي، مو للموظفين أنفسهم
  const staffTabBtn = document.querySelector('.page-tabs button[data-tab="staff"]');
  const staffPanel = document.querySelector('.tab-panel[data-panel="staff"]');
  if (!isPrimaryOwner) {
    if (staffTabBtn) staffTabBtn.remove();
    if (staffPanel) staffPanel.remove();
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
  if (isPrimaryOwner) loadStaffList();
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
    // نعيد الرسم فوراً بدل ما ننتظر وصول تحديث الاستماع الفوري (onSnapshot)،
    // عشان وضع التعديل يقفل مباشرة بمجرد الحفظ بدون تأخير محسوس
    renderBookingRequests();
    renderRejectedBookings();
    renderWeeklySchedule();
    renderUpcoming24h();
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
    wrap.innerHTML = '<p class="empty-state">ما أضفت أي طبيب بعد</p>';
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
    alert('تأكد إن "من تاريخ" قبل "إلى تاريخ"');
    return;
  }
  if (selectedWeekdays.length === 0) {
    alert('اختر يوم أسبوع وحد على الأقل');
    return;
  }
  if (!start || !end || start >= end) {
    alert('تأكد إن وقت البداية قبل وقت النهاية');
    return;
  }

  const rangeDays = (new Date(toDate) - new Date(fromDate)) / (1000 * 60 * 60 * 24);
  if (rangeDays > 180) {
    alert('النطاق طويل جداً، اختر مدة أقصاها 6 أشهر بمرة وحدة');
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
    alert('ما فيه تواريخ جديدة تُضاف (كلها موجودة مسبقاً أو ما فيه يوم مطابق بالنطاق)');
    return;
  }

  const sure = confirm(`بتُضاف ${newEntries.length} تاريخ جديد لهذا الطبيب. تأكيد؟`);
  if (!sure) return;

  await db.collection('doctors').doc(doctorId).update({
    workingHours: [...existing, ...newEntries],
  });
  loadDashboard();
}

function renderDoctorAccordionItem(doc) {
  const isExpanded = doc.id === expandedDoctorId;
  const isEditing = doc.id === editingDoctorId;

  return `
    <div class="doctor-item ${isExpanded ? 'expanded' : ''}">
      <div class="doctor-item-header" data-action="toggle-doctor" data-id="${doc.id}">
        <div class="doctor-item-info">
          <span class="doctor-item-name">${escapeHtml(doc.name)}</span>
          <span class="doctor-item-specialty">${escapeHtml(doc.specialty)}</span>
        </div>
        <div class="doctor-item-actions">
          <button class="btn-xs toggle" data-action="print-doctor" data-id="${doc.id}" title="طباعة جدول الطبيب">🖨️</button>
          <button class="btn-xs toggle" data-action="edit-doctor" data-id="${doc.id}">✏️</button>
          <button class="btn-xs delete" data-action="delete-doctor" data-id="${doc.id}">🗑️</button>
          <span class="doctor-item-arrow">${isExpanded ? '▲' : '▼'}</span>
        </div>
      </div>
      <div class="doctor-item-body ${isExpanded ? '' : 'hidden'}">
        ${isEditing ? `
          <div class="mini-form" style="margin-bottom:14px;">
            <input type="text" class="edit-doctor-name" placeholder="اسم الطبيب" value="${escapeHtml(doc.name)}">
            <input type="text" class="edit-doctor-specialty" placeholder="التخصص" value="${escapeHtml(doc.specialty)}">
            <button type="button" class="btn-xs approve" data-action="save-doctor-edit" data-id="${doc.id}">💾 حفظ</button>
            <button type="button" class="btn-xs delete" data-action="cancel-doctor-edit" data-id="${doc.id}">إلغاء</button>
          </div>
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
      <button type="button" class="btn-xs approve" data-action="toggle-bulk" data-id="${doc.id}">📅 إضافة بالجملة</button>
    </div>

    <div class="bulk-hours-form hidden" data-bulk-for="${doc.id}">
      <p class="bulk-hours-title">إضافة أوقات لعدة تواريخ دفعة وحدة</p>
      <div class="mini-form">
        <div class="field">
          <label>من تاريخ</label>
          <input type="date" class="bulk-from-date">
        </div>
        <div class="field">
          <label>إلى تاريخ</label>
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
        <button type="button" class="btn-xs approve" data-action="submit-bulk" data-id="${doc.id}">إضافة كل التواريخ المطابقة</button>
      </div>
    </div>
  `;
}

// حفظ اسم وتخصص الطبيب مع بعض
// ملاحظة: ما يحدّث اسم الطبيب بالحجوزات القديمة المخزّنة مسبقاً (doctorName)، بس الجديدة بتاخذ الاسم المحدّث
async function saveDoctorEdit(doctorId) {
  const card = document.querySelector(`[data-action="save-doctor-edit"][data-id="${doctorId}"]`).closest('.doctor-item');
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
  select.innerHTML = '<option value="">كل الأطباء</option>' +
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
    wrap.innerHTML = '<p class="empty-state">ما فيه مواعيد مطابقة لهذا الفلتر</p>';
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
    wrap.innerHTML = '<p class="empty-state">ما فيه مواعيد خلال الـ24 ساعة الجاية</p>';
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
  const heads = ['الوقت'];
  if (opts.showDate) heads.push('التاريخ');
  heads.push('المريض', 'رقم الحجز');
  if (opts.showDoctor) heads.push('الطبيب');
  heads.push('تواصل', 'إجراء');

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
  cells.push(`<td class="cell-name">${escapeHtml(b.patientName)}</td>`);
  cells.push(`<td class="cell-sub">${bookingNumber(b.id)}</td>`);
  if (opts.showDoctor) cells.push(`<td>${escapeHtml(b.doctorName)}</td>`);
  cells.push(`
    <td>
      ${b.patientPhone
        ? `<a class="btn-xs whatsapp" href="${buildWhatsAppLink(b)}" target="_blank" rel="noopener">💬 واتساب</a>`
        : '<span class="cell-sub">—</span>'}
    </td>
  `);

  const isPastOrToday = b.date <= todayISO();

  cells.push(`
    <td>
      <div class="row-actions">
        ${b.patientPhone
          ? `<a class="btn-xs toggle" href="${buildReminderLink(b)}" target="_blank" rel="noopener" title="إرسال تذكير واتساب">🔔 تذكير</a>`
          : ''}
        ${isPastOrToday
          ? `<button class="btn-xs reject" data-action="mark-no-show" data-id="${b.id}" title="تعليم لم يحضر">❌ لم يحضر</button>`
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
  const sure = confirm('تعليم هذا الموعد بـ "لم يحضر"؟');
  if (!sure) return;

  try {
    await db.collection('bookings').doc(bookingId).update({ status: 'no_show' });
  } catch (err) {
    console.error('markNoShow error:', err);
    alert('تعذر تسجيل الحالة، حاول مرة أخرى');
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
      <p>لا توجد مواعيد مؤكدة بهذا الأسبوع.</p>
    `;
    return;
  }

  area.innerHTML = `
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(subtitle)}</p>
    <table class="print-table">
      <thead>
        <tr>
          <th>التاريخ</th>
          <th>الوقت</th>
          <th>المريض</th>
          ${showDoctor ? '<th>الطبيب</th>' : ''}
          <th>رقم الحجز</th>
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
      alert('تأكد من تعبئة كل الحقول (كلمة المرور 6 أحرف على الأقل)');
      return;
    }

    const submitBtn = addStaffForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'جاري الإضافة...';

    try {
      await addStaffMember(name, email, password);
      addStaffForm.reset();
      loadStaffList();
    } catch (err) {
      console.error('addStaffMember error:', err);
      const messages = {
        'auth/email-already-in-use': 'هذا البريد الإلكتروني مستخدم مسبقاً',
        'auth/invalid-email': 'صيغة البريد الإلكتروني غير صحيحة',
        'auth/weak-password': 'كلمة المرور ضعيفة، استخدم 6 أحرف على الأقل',
      };
      alert(messages[err.code] || 'تعذر إضافة الموظف، حاول مرة أخرى');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'إضافة موظف';
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
    wrap.innerHTML = '<p class="empty-state">ما أضفت أي موظف بعد</p>';
    return;
  }

  wrap.innerHTML = `
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>الاسم</th>
            <th>البريد الإلكتروني</th>
            <th>الحالة</th>
            <th>إجراءات</th>
          </tr>
        </thead>
        <tbody>
          ${cachedStaff.map((s) => `
            <tr>
              <td class="cell-name">${escapeHtml(s.name)}</td>
              <td class="cell-sub">${escapeHtml(s.email)}</td>
              <td>${staffStatusBadge(s.status)}</td>
              <td>
                <button class="btn-xs toggle" data-action="reset-staff-password" data-email="${escapeHtml(s.email)}">🔄 Reset</button>
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
  const sure = confirm(`إرسال رابط إعادة تعيين كلمة المرور إلى ${email}؟`);
  if (!sure) return;

  try {
    await auth.sendPasswordResetEmail(email);
    alert('تم إرسال رابط إعادة التعيين بنجاح، الموظف يفتح بريده ويتابع الخطوات');
  } catch (err) {
    console.error('resetStaffPassword error:', err);
    alert('تعذر إرسال رابط إعادة التعيين، تأكد من صحة البريد الإلكتروني');
  }
}

function staffStatusBadge(status) {
  const labels = { active: 'فعّال', disabled: 'موقوف' };
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
      datasets: [{ label: 'عدد الحجوزات', data: entries.map((e) => e[1]), backgroundColor: '#158A7E', borderRadius: 6 }],
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
      datasets: [{ label: 'عدد الحجوزات', data: entries.map((e) => e[1]), backgroundColor: '#4ED9C4', borderRadius: 6 }],
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
        label: 'مرضى جدد',
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
  const period = h < 12 ? 'ص' : 'م';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12} ${period}`;
}

function formatMonthLabel(key) {
  const months = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
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
  const statusLabels = { pending: 'قيد الانتظار', accepted: 'مقبول', rejected: 'مرفوض', cancelled: 'ملغى', no_show: 'لم يحضر' };
  const headers = ['رقم الحجز', 'المريض', 'الجوال', 'الطبيب', 'التاريخ', 'الوقت', 'الحالة'];

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

initPageTabs();
