// ============================================
// حماية الصفحة: لازم يكون المستخدم مسجّل دخول وحسابه أدمن فعّال
// ============================================
let currentUid = null;

auth.onAuthStateChanged(async (user) => {
  if (!user) {
    window.location.href = '../index.html';
    return;
  }

  const userDoc = await db.collection('users').doc(user.uid).get();

  if (!userDoc.exists || userDoc.data().role !== 'admin' || userDoc.data().status !== 'active') {
    await auth.signOut();
    window.location.href = '../index.html';
    return;
  }

  currentUid = user.uid;
  document.getElementById('admin-name').textContent = userDoc.data().name || 'الأدمن';

  loadDashboard();
});

document.getElementById('logout-btn').addEventListener('click', async () => {
  await auth.signOut();
  window.location.href = '../index.html';
});

// ============================================
// تحميل كل بيانات اللوحة
// ============================================
async function loadDashboard() {
  const [usersSnap, doctorsSnap, bookingsSnap] = await Promise.all([
    db.collection('users').get(),
    db.collection('doctors').get(),
    db.collection('bookings').get(),
  ]);

  const allUsers = usersSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const allDoctors = doctorsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const allBookings = bookingsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

  renderStats(allUsers, doctorsSnap.size, bookingsSnap.size);
  renderPendingClinics(allUsers);
  renderRejectedClinics(allUsers);
  renderStaffList(allUsers);
  loadAds();
  loadSpecialties();
  renderRecentUsers(allUsers);
  renderAllUsersTable(allUsers);
  renderPlatformStats(allUsers, allDoctors, allBookings);
}

// ============================================
// شبكة الإحصائيات
// ============================================
function renderStats(allUsers, doctorsCount, bookingsCount) {
  const clinics = allUsers.filter((u) => u.role === 'clinic' && u.status === 'active');
  const patients = allUsers.filter((u) => u.role === 'patient');

  document.getElementById('stat-clinics').textContent = clinics.length;
  document.getElementById('stat-patients').textContent = patients.length;
  document.getElementById('stat-doctors').textContent = doctorsCount;
  document.getElementById('stat-bookings').textContent = bookingsCount;
}

// ============================================
// طلبات تسجيل العيادات (المعلّقة والمرفوضة)
// ============================================
function renderPendingClinics(allUsers) {
  const pending = allUsers.filter((u) => u.role === 'clinic' && u.status === 'pending');
  document.getElementById('pending-count').textContent = pending.length;
  renderClinicStatusTable(pending, 'pending-clinics-wrap', 'لا توجد طلبات تسجيل عيادات بانتظار المراجعة حالياً');
}

function renderRejectedClinics(allUsers) {
  const rejected = allUsers.filter((u) => u.role === 'clinic' && u.status === 'rejected');
  renderClinicStatusTable(rejected, 'rejected-clinics-wrap', 'لا توجد عيادات مرفوضة حالياً');
}

// جدول موحّد للعيادات (يُستخدم للمعلّقة والمرفوضة): قبول، رفض، تعديل، حذف
function renderClinicStatusTable(clinics, wrapId, emptyText) {
  const wrap = document.getElementById(wrapId);

  if (clinics.length === 0) {
    wrap.innerHTML = `<p class="empty-state">${emptyText}</p>`;
    return;
  }

  wrap.innerHTML = `
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>اسم العيادة</th>
            <th>البريد الإلكتروني</th>
            <th>واتساب</th>
            <th>إجراء</th>
          </tr>
        </thead>
        <tbody>
          ${clinics.map((u) => (u.id === editingUid ? renderEditRow(u, 4) : renderClinicStatusRow(u))).join('')}
        </tbody>
      </table>
    </div>
  `;

  wrap.querySelectorAll('[data-action="approve-clinic"]').forEach((btn) => {
    btn.addEventListener('click', () => setClinicStatus(btn.dataset.uid, 'active'));
  });
  wrap.querySelectorAll('[data-action="reject-clinic"]').forEach((btn) => {
    btn.addEventListener('click', () => setClinicStatus(btn.dataset.uid, 'rejected'));
  });
  wrap.querySelectorAll('[data-action="edit"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      editingUid = btn.dataset.uid;
      rerenderFromCache();
    });
  });
  wrap.querySelectorAll('[data-action="cancel-edit"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      editingUid = null;
      rerenderFromCache();
    });
  });
  wrap.querySelectorAll('[data-action="save-edit"]').forEach((btn) => {
    btn.addEventListener('click', () => saveUserEdit(btn.dataset.uid));
  });
  wrap.querySelectorAll('[data-action="delete"]').forEach((btn) => {
    btn.addEventListener('click', () => deleteUser(btn.dataset.uid));
  });
}

function renderClinicStatusRow(u) {
  return `
    <tr>
      <td class="cell-name">${escapeHtml(u.name)}</td>
      <td class="cell-sub">${escapeHtml(u.email)}</td>
      <td class="cell-sub">${escapeHtml(u.phone || '—')}</td>
      <td>
        <div class="row-actions">
          <button class="btn-xs approve" data-action="approve-clinic" data-uid="${u.id}">قبول</button>
          <button class="btn-xs reject" data-action="reject-clinic" data-uid="${u.id}">رفض</button>
          <button class="btn-xs toggle" data-action="edit" data-uid="${u.id}">✏️</button>
          <button class="btn-xs delete" data-action="delete" data-uid="${u.id}">🗑️</button>
        </div>
      </td>
    </tr>
  `;
}

async function setClinicStatus(uid, status) {
  await db.collection('users').doc(uid).update({ status });
  loadDashboard();
}

// إعادة رسم كل الأقسام من البيانات المخزّنة مؤقتاً (بدون إعادة الجلب من Firestore) - تُستخدم عند تبديل وضع التعديل فقط
function rerenderFromCache() {
  renderPendingClinics(cachedUsers);
  renderRejectedClinics(cachedUsers);
  renderStaffList(cachedUsers);
  renderRecentUsers(cachedUsers);
  drawUsersTable();
}

// ============================================
// موظفو العيادات (يشوفها ويديرها الأدمن بس)
// ============================================
function renderStaffList(allUsers) {
  const wrap = document.getElementById('staff-list-wrap');
  const staff = allUsers.filter((u) => u.role === 'staff');

  if (staff.length === 0) {
    wrap.innerHTML = '<p class="empty-state">ما فيه موظفين مسجّلين حالياً</p>';
    return;
  }

  wrap.innerHTML = `
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>الاسم</th>
            <th>العيادة التابع لها</th>
            <th>الحالة</th>
            <th>إجراءات</th>
          </tr>
        </thead>
        <tbody>
          ${staff.map((s) => (s.id === editingUid ? renderEditRow(s, 4) : renderStaffRow(s, allUsers))).join('')}
        </tbody>
      </table>
    </div>
  `;

  wrap.querySelectorAll('[data-action="edit"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      editingUid = btn.dataset.uid;
      rerenderFromCache();
    });
  });
  wrap.querySelectorAll('[data-action="cancel-edit"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      editingUid = null;
      rerenderFromCache();
    });
  });
  wrap.querySelectorAll('[data-action="save-edit"]').forEach((btn) => {
    btn.addEventListener('click', () => saveUserEdit(btn.dataset.uid));
  });
  wrap.querySelectorAll('[data-action="disable"]').forEach((btn) => {
    btn.addEventListener('click', () => updateUserStatus(btn.dataset.uid, 'disabled'));
  });
  wrap.querySelectorAll('[data-action="enable"]').forEach((btn) => {
    btn.addEventListener('click', () => updateUserStatus(btn.dataset.uid, 'active'));
  });
  wrap.querySelectorAll('[data-action="reset-password"]').forEach((btn) => {
    btn.addEventListener('click', () => resetUserPassword(btn.dataset.email));
  });
  wrap.querySelectorAll('[data-action="delete"]').forEach((btn) => {
    btn.addEventListener('click', () => deleteUser(btn.dataset.uid));
  });
}

function renderStaffRow(s, allUsers) {
  const owner = allUsers.find((u) => u.id === s.staffOf);
  const ownerName = owner ? owner.name : 'غير معروف';

  return `
    <tr>
      <td>
        <div class="cell-name">${escapeHtml(s.name)}</div>
        <div class="cell-sub">${escapeHtml(s.email)}</div>
      </td>
      <td class="cell-sub">${escapeHtml(ownerName)}</td>
      <td>${statusBadge(s.status)}</td>
      <td>
        <div class="row-actions">
          <button class="btn-xs toggle" data-action="edit" data-uid="${s.id}">✏️ تعديل</button>
          ${s.status === 'disabled'
            ? `<button class="btn-xs approve" data-action="enable" data-uid="${s.id}">✅ تفعيل</button>`
            : `<button class="btn-xs reject" data-action="disable" data-uid="${s.id}">⛔ إيقاف</button>`}
          <button class="btn-xs toggle" data-action="reset-password" data-email="${escapeHtml(s.email)}">🔄 كلمة المرور</button>
          <button class="btn-xs delete" data-action="delete" data-uid="${s.id}">🗑️ حذف</button>
        </div>
      </td>
    </tr>
  `;
}

// يرسل بريد إعادة تعيين كلمة المرور لهذا الموظف (رابط آمن، ما يكشف كلمة المرور لأحد حتى الأدمن)
async function resetUserPassword(email) {
  const sure = confirm(`إرسال رابط إعادة تعيين كلمة المرور إلى ${email}؟`);
  if (!sure) return;

  try {
    await auth.sendPasswordResetEmail(email);
    alert('تم إرسال رابط إعادة التعيين بنجاح، صاحب الحساب يفتح بريده ويتابع الخطوات');
  } catch (err) {
    console.error('resetUserPassword error:', err);
    alert('تعذر إرسال رابط إعادة التعيين، تأكد من صحة البريد الإلكتروني');
  }
}


function renderRecentUsers(allUsers) {
  const sorted = [...allUsers]
    .filter((u) => u.createdAt)
    .sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis())
    .slice(0, 5);

  const wrap = document.getElementById('recent-users-wrap');

  if (sorted.length === 0) {
    wrap.innerHTML = '<p class="empty-state">لا يوجد تسجيلات بعد</p>';
    return;
  }

  wrap.innerHTML = `
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>الاسم</th>
            <th>النوع</th>
            <th>الحالة</th>
            <th>تاريخ التسجيل</th>
          </tr>
        </thead>
        <tbody>
          ${sorted.map((u) => `
            <tr>
              <td>
                <div class="cell-name">${escapeHtml(u.name)}</div>
                <div class="cell-sub">${escapeHtml(u.email)}</div>
              </td>
              <td>${roleBadge(u.role)}</td>
              <td>${statusBadge(u.status)}</td>
              <td class="cell-sub">${formatDate(u.createdAt)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// ============================================
// جدول جميع المستخدمين + فلترة + إدارة الحسابات
// ============================================
let activeFilter = 'all';
let cachedUsers = [];
let editingUid = null;

function renderAllUsersTable(allUsers) {
  cachedUsers = allUsers;

  document.querySelectorAll('.filter-tabs button').forEach((btn) => {
    btn.onclick = () => {
      activeFilter = btn.dataset.filter;
      editingUid = null;
      document.querySelectorAll('.filter-tabs button').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      drawUsersTable();
    };
  });

  drawUsersTable();
}

function drawUsersTable() {
  const wrap = document.getElementById('all-users-wrap');

  let list = cachedUsers.filter((u) => u.role !== 'admin');
  if (activeFilter === 'clinic') list = list.filter((u) => u.role === 'clinic');
  if (activeFilter === 'patient') list = list.filter((u) => u.role === 'patient');

  if (list.length === 0) {
    wrap.innerHTML = '<p class="empty-state">لا يوجد مستخدمين ضمن هذا التصنيف</p>';
    return;
  }

  wrap.innerHTML = `
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>الاسم</th>
            <th>النوع</th>
            <th>الحالة</th>
            <th>إجراءات</th>
          </tr>
        </thead>
        <tbody>
          ${list.map((u) => (u.id === editingUid ? renderEditRow(u) : renderUserRow(u))).join('')}
        </tbody>
      </table>
    </div>
  `;

  bindUserRowEvents(wrap);
}

function renderUserRow(u) {
  return `
    <tr>
      <td>
        <div class="cell-name">${escapeHtml(u.name)}</div>
        <div class="cell-sub">${escapeHtml(u.email)}${u.phone ? ' • ' + escapeHtml(u.phone) : ''}</div>
      </td>
      <td>${roleBadge(u.role)}</td>
      <td>${statusBadge(u.status)}</td>
      <td>
        <div class="row-actions">
          <button class="btn-xs toggle" data-action="edit" data-uid="${u.id}">✏️ تعديل</button>
          ${u.status === 'disabled'
            ? `<button class="btn-xs approve" data-action="enable" data-uid="${u.id}">✅ تفعيل</button>`
            : `<button class="btn-xs reject" data-action="disable" data-uid="${u.id}">⛔ إيقاف</button>`}
          <button class="btn-xs toggle" data-action="reset-password" data-email="${escapeHtml(u.email)}">🔄 Reset</button>
          <button class="btn-xs delete" data-action="delete" data-uid="${u.id}">🗑️ حذف</button>
        </div>
      </td>
    </tr>
  `;
}

// صف التعديل: يفتح كل الحقول مع بعض (الاسم، البريد، ورقم الجوال)
function renderEditRow(u, colspan) {
  return `
    <tr>
      <td colspan="${colspan || 4}">
        <div class="mini-form">
          <input type="text" class="edit-name" placeholder="الاسم" value="${escapeHtml(u.name)}">
          <input type="email" class="edit-email" placeholder="البريد الإلكتروني" value="${escapeHtml(u.email)}">
          <input type="tel" class="edit-phone" placeholder="رقم واتساب" value="${escapeHtml(u.phone || '')}">
          <button type="button" class="btn-xs approve" data-action="save-edit" data-uid="${u.id}">💾 حفظ</button>
          <button type="button" class="btn-xs delete" data-action="cancel-edit" data-uid="${u.id}">إلغاء</button>
        </div>
      </td>
    </tr>
  `;
}

function bindUserRowEvents(wrap) {
  wrap.querySelectorAll('[data-action="edit"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      editingUid = btn.dataset.uid;
      rerenderFromCache();
    });
  });
  wrap.querySelectorAll('[data-action="cancel-edit"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      editingUid = null;
      rerenderFromCache();
    });
  });
  wrap.querySelectorAll('[data-action="save-edit"]').forEach((btn) => {
    btn.addEventListener('click', () => saveUserEdit(btn.dataset.uid));
  });
  wrap.querySelectorAll('[data-action="disable"]').forEach((btn) => {
    btn.addEventListener('click', () => updateUserStatus(btn.dataset.uid, 'disabled'));
  });
  wrap.querySelectorAll('[data-action="enable"]').forEach((btn) => {
    btn.addEventListener('click', () => updateUserStatus(btn.dataset.uid, 'active'));
  });
  wrap.querySelectorAll('[data-action="reset-password"]').forEach((btn) => {
    btn.addEventListener('click', () => resetUserPassword(btn.dataset.email));
  });
  wrap.querySelectorAll('[data-action="delete"]').forEach((btn) => {
    btn.addEventListener('click', () => deleteUser(btn.dataset.uid));
  });
}

// حفظ كل الحقول مع بعض (اسم + بريد + جوال للمريض)
// ملاحظة: يعدّل بيانات الملف الشخصي بـ Firestore بس، ما يغيّر بريد الدخول الفعلي بـ Firebase Authentication
async function saveUserEdit(uid) {
  const row = document.querySelector(`[data-action="save-edit"][data-uid="${uid}"]`).closest('tr');
  const name = row.querySelector('.edit-name').value.trim();
  const email = row.querySelector('.edit-email').value.trim();
  const phoneInput = row.querySelector('.edit-phone');

  if (!name || !email) {
    alert('الاسم والبريد الإلكتروني إجباريين');
    return;
  }

  const updates = { name, email };
  if (phoneInput) updates.phone = phoneInput.value.trim();

  try {
    await db.collection('users').doc(uid).update(updates);
    editingUid = null;
    loadDashboard();
  } catch (err) {
    console.error('saveUserEdit error:', err);
    alert('تعذر حفظ التعديلات، حاول مرة أخرى');
  }
}

async function updateUserStatus(uid, status) {
  await db.collection('users').doc(uid).update({ status });
  loadDashboard();
}

async function deleteUser(uid) {
  const sure = confirm('متأكد إنك تبي تحذف هذا الحساب؟ لا يمكن التراجع عن هذا الإجراء.');
  if (!sure) return;

  await db.collection('users').doc(uid).delete();
  loadDashboard();
}

// ============================================
// أدوات مساعدة للعرض
// ============================================
function roleBadge(role) {
  const labels = { clinic: 'عيادة', patient: 'مريض', admin: 'أدمن' };
  return `<span class="badge badge-role">${labels[role] || role}</span>`;
}

function statusBadge(status) {
  const labels = { active: 'فعّال', pending: 'قيد المراجعة', disabled: 'موقوف', rejected: 'مرفوض' };
  const cls = { active: 'badge-active', pending: 'badge-pending', disabled: 'badge-disabled', rejected: 'badge-rejected' };
  return `<span class="badge ${cls[status] || ''}">${labels[status] || status}</span>`;
}

function formatDate(timestamp) {
  if (!timestamp) return '—';
  const date = timestamp.toDate();
  return date.toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' });
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
// الإحصائيات الشاملة (مستوى المنصة كلها)
// ============================================
let platformRegChart = null;
let platformClinicsChart = null;

function renderPlatformStats(allUsers, allDoctors, allBookings) {
  const clinicsEl = document.getElementById('platform-stat-clinics');
  if (!clinicsEl) return; // التبويب لسا ما انفتح

  const activeClinics = allUsers.filter((u) => u.role === 'clinic' && u.status === 'active');
  const patients = allUsers.filter((u) => u.role === 'patient');

  const negativeCount = allBookings.filter((b) => ['rejected', 'cancelled', 'no_show'].includes(b.status)).length;
  const cancelRate = allBookings.length > 0 ? Math.round((negativeCount / allBookings.length) * 100) : 0;

  document.getElementById('platform-stat-clinics').textContent = activeClinics.length;
  document.getElementById('platform-stat-doctors').textContent = allDoctors.length;
  document.getElementById('platform-stat-patients').textContent = patients.length;
  document.getElementById('platform-stat-bookings').textContent = allBookings.length;
  document.getElementById('platform-stat-cancel-rate').textContent = `${cancelRate}%`;

  if (typeof Chart === 'undefined') return;

  // تسجيلات جديدة شهرياً (عيادات + مرضى) - آخر 6 أشهر
  const monthBuckets = buildLast6MonthBuckets();
  const clinicBuckets = { ...monthBuckets };
  const patientBuckets = { ...monthBuckets };

  allUsers.forEach((u) => {
    if (!u.createdAt || (u.role !== 'clinic' && u.role !== 'patient')) return;
    const d = u.createdAt.toDate();
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!(key in monthBuckets)) return;
    if (u.role === 'clinic') clinicBuckets[key] += 1;
    if (u.role === 'patient') patientBuckets[key] += 1;
  });

  const monthKeys = Object.keys(monthBuckets);
  const monthLabels = monthKeys.map(formatMonthLabelShort);

  const regCanvas = document.getElementById('chart-platform-registrations');
  if (regCanvas) {
    if (platformRegChart) platformRegChart.destroy();
    platformRegChart = new Chart(regCanvas, {
      type: 'bar',
      data: {
        labels: monthLabels,
        datasets: [
          { label: 'عيادات', data: monthKeys.map((k) => clinicBuckets[k]), backgroundColor: '#D19F00', borderRadius: 6 },
          { label: 'مرضى', data: monthKeys.map((k) => patientBuckets[k]), backgroundColor: '#0E5478', borderRadius: 6 },
        ],
      },
      options: {
        responsive: true,
        plugins: { legend: { display: true, position: 'bottom' } },
        scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
      },
    });
  }

  // أكثر 5 عيادات نشاطاً حسب عدد الحجوزات
  const bookingCountByClinic = {};
  allBookings.forEach((b) => {
    bookingCountByClinic[b.clinicId] = (bookingCountByClinic[b.clinicId] || 0) + 1;
  });

  const topClinics = Object.entries(bookingCountByClinic)
    .map(([clinicId, count]) => {
      const clinic = allUsers.find((u) => u.id === clinicId);
      return { name: clinic ? clinic.name : 'عيادة محذوفة', count };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const clinicsCanvas = document.getElementById('chart-platform-top-clinics');
  if (clinicsCanvas) {
    if (platformClinicsChart) platformClinicsChart.destroy();
    platformClinicsChart = new Chart(clinicsCanvas, {
      type: 'bar',
      data: {
        labels: topClinics.map((c) => c.name),
        datasets: [{ label: 'عدد الحجوزات', data: topClinics.map((c) => c.count), backgroundColor: '#158A7E', borderRadius: 6 }],
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
      },
    });
  }
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

function formatMonthLabelShort(key) {
  const months = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  const m = parseInt(key.split('-')[1], 10);
  return months[m - 1];
}

// ============================================
// إعلانات الشاشة الرئيسية
// ============================================
let cachedAds = [];

const addAdForm = document.getElementById('add-ad-form');
if (addAdForm) {
  addAdForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const title = document.getElementById('new-ad-title').value.trim();
    const linkUrl = document.getElementById('new-ad-link').value.trim();
    const fileInput = document.getElementById('new-ad-image');
    const file = fileInput.files[0];

    if (!file) {
      alert('فضلاً اختر صورة');
      return;
    }
    if (!file.type.startsWith('image/')) {
      alert('الملف لازم يكون صورة');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert('حجم الصورة كبير، الحد الأقصى 5 ميجابايت');
      return;
    }

    const submitBtn = addAdForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'جاري الرفع...';

    const progressWrap = document.getElementById('ad-upload-progress');
    const progressFill = document.getElementById('ad-progress-fill');
    progressWrap.classList.remove('hidden');
    progressFill.style.width = '0%';

    try {
      const storagePath = `ads/${Date.now()}_${file.name}`;
      const ref = storage.ref(storagePath);
      const uploadTask = ref.put(file);

      await new Promise((resolve, reject) => {
        uploadTask.on('state_changed',
          (snapshot) => {
            const pct = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
            progressFill.style.width = `${pct}%`;
          },
          reject,
          resolve
        );
      });

      const imageUrl = await ref.getDownloadURL();

      await db.collection('ads').add({
        title,
        linkUrl,
        imageUrl,
        storagePath,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });

      addAdForm.reset();
      loadAds();
    } catch (err) {
      console.error('add ad error:', err);
      alert('تعذر رفع الإعلان، حاول مرة أخرى');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'رفع الإعلان';
      progressWrap.classList.add('hidden');
    }
  });
}

async function loadAds() {
  const wrap = document.getElementById('ads-list-wrap');
  if (!wrap) return;

  try {
    const snap = await db.collection('ads').get();
    cachedAds = snap.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .sort((a, b) => {
        if (!a.createdAt || !b.createdAt) return 0;
        return b.createdAt.toMillis() - a.createdAt.toMillis();
      });
    renderAdsList();
  } catch (err) {
    console.error('loadAds error:', err);
    wrap.innerHTML = '<p class="empty-state">تعذر تحميل الإعلانات</p>';
  }
}

function renderAdsList() {
  const wrap = document.getElementById('ads-list-wrap');

  if (cachedAds.length === 0) {
    wrap.innerHTML = '<p class="empty-state">ما فيه إعلانات مضافة بعد</p>';
    return;
  }

  wrap.innerHTML = `
    <div class="ads-grid">
      ${cachedAds.map((ad) => `
        <div class="ad-card">
          <img src="${ad.imageUrl}" alt="${escapeHtml(ad.title || 'إعلان')}" class="ad-thumb">
          <p class="ad-card-title">${escapeHtml(ad.title || 'بدون عنوان')}</p>
          ${ad.linkUrl ? `<p class="cell-sub">${escapeHtml(ad.linkUrl)}</p>` : ''}
          <button class="btn-xs delete" data-action="delete-ad" data-id="${ad.id}" data-path="${escapeHtml(ad.storagePath || '')}">🗑️ حذف</button>
        </div>
      `).join('')}
    </div>
  `;

  wrap.querySelectorAll('[data-action="delete-ad"]').forEach((btn) => {
    btn.addEventListener('click', () => deleteAd(btn.dataset.id, btn.dataset.path));
  });
}

async function deleteAd(adId, storagePath) {
  const sure = confirm('حذف هذا الإعلان نهائياً؟');
  if (!sure) return;

  try {
    await db.collection('ads').doc(adId).delete();
    if (storagePath) {
      await storage.ref(storagePath).delete().catch(() => {});
    }
    loadAds();
  } catch (err) {
    console.error('deleteAd error:', err);
    alert('تعذر حذف الإعلان، حاول مرة أخرى');
  }
}

// ============================================
// تخصصات الشاشة الرئيسية
// ============================================
let cachedSpecialties = [];

const addSpecialtyForm = document.getElementById('add-specialty-form');
if (addSpecialtyForm) {
  addSpecialtyForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const name = document.getElementById('new-specialty-name').value.trim();
    const icon = document.getElementById('new-specialty-icon').value.trim();

    if (!name || !icon) {
      alert('فضلاً عبّي الاسم والأيقونة');
      return;
    }

    const submitBtn = addSpecialtyForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'جاري الإضافة...';

    try {
      const maxOrder = cachedSpecialties.reduce((max, s) => Math.max(max, s.order || 0), 0);
      await db.collection('specialties').add({
        name,
        icon,
        order: maxOrder + 1,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
      addSpecialtyForm.reset();
      loadSpecialties();
    } catch (err) {
      console.error('add specialty error:', err);
      alert('تعذر إضافة التخصص، حاول مرة أخرى');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'إضافة تخصص';
    }
  });
}

async function loadSpecialties() {
  const wrap = document.getElementById('specialties-list-wrap');
  if (!wrap) return;

  try {
    const snap = await db.collection('specialties').get();
    cachedSpecialties = snap.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .sort((a, b) => (a.order || 0) - (b.order || 0));
    renderSpecialtiesList();
  } catch (err) {
    console.error('loadSpecialties error:', err);
    wrap.innerHTML = '<p class="empty-state">تعذر تحميل التخصصات</p>';
  }
}

function renderSpecialtiesList() {
  const wrap = document.getElementById('specialties-list-wrap');

  if (cachedSpecialties.length === 0) {
    wrap.innerHTML = '<p class="empty-state">ما فيه تخصصات مضافة بعد — الشاشة الرئيسية بتعرض "الكل" بس لين تضيف تخصص</p>';
    return;
  }

  wrap.innerHTML = `
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>الترتيب</th>
            <th>الأيقونة</th>
            <th>الاسم</th>
            <th>إجراءات</th>
          </tr>
        </thead>
        <tbody>
          ${cachedSpecialties.map((s, i) => `
            <tr>
              <td>
                <button class="btn-xs toggle" data-action="move-specialty-up" data-id="${s.id}" ${i === 0 ? 'disabled' : ''}>▲</button>
                <button class="btn-xs toggle" data-action="move-specialty-down" data-id="${s.id}" ${i === cachedSpecialties.length - 1 ? 'disabled' : ''}>▼</button>
              </td>
              <td style="font-size:20px;">${escapeHtml(s.icon)}</td>
              <td class="cell-name">${escapeHtml(s.name)}</td>
              <td>
                <button class="btn-xs toggle" data-action="edit-specialty" data-id="${s.id}">✏️</button>
                <button class="btn-xs delete" data-action="delete-specialty" data-id="${s.id}">🗑️</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;

  wrap.querySelectorAll('[data-action="move-specialty-up"]').forEach((btn) => {
    btn.addEventListener('click', () => moveSpecialty(btn.dataset.id, -1));
  });
  wrap.querySelectorAll('[data-action="move-specialty-down"]').forEach((btn) => {
    btn.addEventListener('click', () => moveSpecialty(btn.dataset.id, 1));
  });
  wrap.querySelectorAll('[data-action="delete-specialty"]').forEach((btn) => {
    btn.addEventListener('click', () => deleteSpecialty(btn.dataset.id));
  });
  wrap.querySelectorAll('[data-action="edit-specialty"]').forEach((btn) => {
    btn.addEventListener('click', () => editSpecialty(btn.dataset.id));
  });
}

// يبدّل ترتيب تخصصين متجاورين (تبديل قيم order بينهم)
async function moveSpecialty(specId, direction) {
  const index = cachedSpecialties.findIndex((s) => s.id === specId);
  const swapIndex = index + direction;
  if (swapIndex < 0 || swapIndex >= cachedSpecialties.length) return;

  const a = cachedSpecialties[index];
  const b = cachedSpecialties[swapIndex];
  const aOrder = a.order || 0;
  const bOrder = b.order || 0;

  try {
    await Promise.all([
      db.collection('specialties').doc(a.id).update({ order: bOrder }),
      db.collection('specialties').doc(b.id).update({ order: aOrder }),
    ]);
    loadSpecialties();
  } catch (err) {
    console.error('moveSpecialty error:', err);
    alert('تعذر تغيير الترتيب، حاول مرة أخرى');
  }
}

function editSpecialty(specId) {
  const spec = cachedSpecialties.find((s) => s.id === specId);
  if (!spec) return;

  const newName = prompt('اسم التخصص:', spec.name);
  if (newName === null) return;
  const newIcon = prompt('الأيقونة (إيموجي):', spec.icon);
  if (newIcon === null) return;

  if (!newName.trim() || !newIcon.trim()) {
    alert('الاسم والأيقونة إجباريين');
    return;
  }

  db.collection('specialties').doc(specId).update({ name: newName.trim(), icon: newIcon.trim() })
    .then(loadSpecialties)
    .catch((err) => {
      console.error('editSpecialty error:', err);
      alert('تعذر حفظ التعديل، حاول مرة أخرى');
    });
}

async function deleteSpecialty(specId) {
  const sure = confirm('حذف هذا التخصص من الشاشة الرئيسية؟');
  if (!sure) return;

  try {
    await db.collection('specialties').doc(specId).delete();
    loadSpecialties();
  } catch (err) {
    console.error('deleteSpecialty error:', err);
    alert('تعذر الحذف، حاول مرة أخرى');
  }
}

initPageTabs();
