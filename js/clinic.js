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
    window.location.href = '../login.html';
    return;
  }

  const userDoc = await db.collection('users').doc(user.uid).get();

  if (!userDoc.exists || userDoc.data().role !== 'clinic' || userDoc.data().status !== 'active') {
    await auth.signOut();
    window.location.href = '../login.html';
    return;
  }

  currentUid = user.uid;
  clinicName = userDoc.data().name || 'العيادة';
  document.getElementById('clinic-name').textContent = clinicName;

  loadDashboard();
});

document.getElementById('logout-btn').addEventListener('click', async () => {
  await auth.signOut();
  window.location.href = '../login.html';
});

// ============================================
// تحميل بيانات اللوحة
// ============================================
let cachedDoctors = [];
let cachedBookings = [];

async function loadDashboard() {
  const [doctorsSnap, bookingsSnap] = await Promise.all([
    db.collection('doctors').where('clinicId', '==', currentUid).get(),
    db.collection('bookings').where('clinicId', '==', currentUid).get(),
  ]);

  cachedDoctors = doctorsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  cachedBookings = bookingsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

  renderStats();
  renderBookingRequests();
  renderDoctors();
  renderWeeklySchedule();
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
}

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

  wrap.innerHTML = `
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
          ${pending.map((b) => `
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
          `).join('')}
        </tbody>
      </table>
    </div>
  `;

  wrap.querySelectorAll('[data-action="accept"]').forEach((btn) => {
    btn.addEventListener('click', () => respondToBooking(btn.dataset.id, 'accepted'));
  });
  wrap.querySelectorAll('[data-action="reject"]').forEach((btn) => {
    btn.addEventListener('click', () => respondToBooking(btn.dataset.id, 'rejected'));
  });
  wrap.querySelectorAll('[data-action="edit"]').forEach((btn) => {
    btn.addEventListener('click', () => editBooking(btn.dataset.id));
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
async function editBooking(bookingId) {
  const booking = cachedBookings.find((b) => b.id === bookingId);
  if (!booking) return;

  const newDate = prompt('التاريخ الجديد (YYYY-MM-DD):', booking.date);
  if (!newDate) return;

  const newTime = prompt('الوقت الجديد (HH:MM):', booking.time);
  if (!newTime) return;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate) || !/^\d{2}:\d{2}$/.test(newTime)) {
    alert('صيغة التاريخ أو الوقت غير صحيحة');
    return;
  }

  try {
    await db.collection('bookings').doc(bookingId).update({ date: newDate, time: newTime });

    if (booking.status === 'accepted') {
      await db.collection('lockedSlots').doc(buildLockId(booking.doctorId, booking.date, booking.time)).delete();
      await db.collection('lockedSlots').doc(buildLockId(booking.doctorId, newDate, newTime)).set({
        doctorId: booking.doctorId,
        clinicId: booking.clinicId,
        date: newDate,
        time: newTime,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
    }

    loadDashboard();
  } catch (err) {
    console.error('editBooking error:', err);
    alert('تعذر تعديل الموعد، حاول مرة أخرى');
  }
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
      ${cachedDoctors.map((doc) => `
        <div class="doctor-card">
          <div class="doctor-head">
            <div>
              <p class="doctor-name">${escapeHtml(doc.name)}</p>
              <p class="doctor-specialty">${escapeHtml(doc.specialty)}</p>
            </div>
            <button class="btn-xs delete" data-action="delete-doctor" data-id="${doc.id}">حذف</button>
          </div>

          <div class="hours-list">
            ${(doc.workingHours || []).length === 0
              ? '<span class="cell-sub">ما تم تحديد أوقات عمل بعد</span>'
              : doc.workingHours.map((h, i) => `
                  <span class="hours-chip">
                    ${dayLabel(h.day)} ${h.start} - ${h.end}
                    <button data-action="remove-hour" data-id="${doc.id}" data-index="${i}">×</button>
                  </span>
                `).join('')}
          </div>

          <div class="mini-form" data-add-hour-for="${doc.id}">
            <select class="hour-day">${DAYS.map((d) => `<option value="${d.key}">${d.label}</option>`).join('')}</select>
            <input type="time" class="hour-start" value="09:00">
            <input type="time" class="hour-end" value="14:00">
            <button type="button" class="btn-xs toggle" data-action="add-hour" data-id="${doc.id}">إضافة وقت</button>
          </div>
        </div>
      `).join('')}
    </div>
  `;

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

async function deleteDoctor(doctorId) {
  const sure = confirm('متأكد إنك تبي تحذف هذا الطبيب؟');
  if (!sure) return;
  await db.collection('doctors').doc(doctorId).delete();
  loadDashboard();
}

async function addWorkingHour(doctorId) {
  const card = document.querySelector(`[data-add-hour-for="${doctorId}"]`);
  const day = card.querySelector('.hour-day').value;
  const start = card.querySelector('.hour-start').value;
  const end = card.querySelector('.hour-end').value;

  if (!start || !end || start >= end) {
    alert('تأكد إن وقت البداية قبل وقت النهاية');
    return;
  }

  const doctor = cachedDoctors.find((d) => d.id === doctorId);
  const updatedHours = [...(doctor.workingHours || []), { day, start, end }];

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
              ${dayBookings.map((b) => `
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
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }).join('');

  wrap.querySelectorAll('[data-action="edit-schedule"]').forEach((btn) => {
    btn.addEventListener('click', () => editBooking(btn.dataset.id));
  });
  wrap.querySelectorAll('[data-action="delete-schedule"]').forEach((btn) => {
    btn.addEventListener('click', () => deleteBooking(btn.dataset.id));
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
