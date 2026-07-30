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
  const usersSnap = await db.collection('users').get();
  const allUsers = usersSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

  renderStats(allUsers);
  renderPendingClinics(allUsers);
  renderRecentUsers(allUsers);
  renderAllUsersTable(allUsers);
}

// ============================================
// شبكة الإحصائيات
// ============================================
function renderStats(allUsers) {
  const clinics = allUsers.filter((u) => u.role === 'clinic' && u.status === 'active');
  const patients = allUsers.filter((u) => u.role === 'patient');

  document.getElementById('stat-clinics').textContent = clinics.length;
  document.getElementById('stat-patients').textContent = patients.length;
  // الأطباء والحجوزات مجموعاتهم لسا ما انبنت بالتطبيق، فتظهر 0 مؤقتاً
  document.getElementById('stat-doctors').textContent = '0';
  document.getElementById('stat-bookings').textContent = '0';
}

// ============================================
// طلبات تسجيل العيادات المعلّقة
// ============================================
function renderPendingClinics(allUsers) {
  const pending = allUsers.filter((u) => u.role === 'clinic' && u.status === 'pending');
  const wrap = document.getElementById('pending-clinics-wrap');
  const countLabel = document.getElementById('pending-count');

  countLabel.textContent = pending.length;

  if (pending.length === 0) {
    wrap.innerHTML = '<p class="empty-state">لا توجد طلبات تسجيل عيادات بانتظار المراجعة حالياً</p>';
    return;
  }

  wrap.innerHTML = `
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>اسم العيادة</th>
            <th>البريد الإلكتروني</th>
            <th>إجراء</th>
          </tr>
        </thead>
        <tbody>
          ${pending.map((u) => `
            <tr>
              <td class="cell-name">${escapeHtml(u.name)}</td>
              <td>${escapeHtml(u.email)}</td>
              <td>
                <div class="row-actions">
                  <button class="btn-xs approve" data-action="approve" data-uid="${u.id}">قبول</button>
                  <button class="btn-xs reject" data-action="reject" data-uid="${u.id}">رفض</button>
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;

  wrap.querySelectorAll('[data-action="approve"]').forEach((btn) => {
    btn.addEventListener('click', () => setClinicStatus(btn.dataset.uid, 'active'));
  });
  wrap.querySelectorAll('[data-action="reject"]').forEach((btn) => {
    btn.addEventListener('click', () => setClinicStatus(btn.dataset.uid, 'rejected'));
  });
}

async function setClinicStatus(uid, status) {
  await db.collection('users').doc(uid).update({ status });
  loadDashboard();
}

// ============================================
// آخر التسجيلات (أحدث 5 حسابات)
// ============================================
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

function renderAllUsersTable(allUsers) {
  cachedUsers = allUsers;

  document.querySelectorAll('.filter-tabs button').forEach((btn) => {
    btn.onclick = () => {
      activeFilter = btn.dataset.filter;
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
          ${list.map((u) => `
            <tr>
              <td>
                <div class="cell-name">${escapeHtml(u.name)}</div>
                <div class="cell-sub">${escapeHtml(u.email)}</div>
              </td>
              <td>${roleBadge(u.role)}</td>
              <td>${statusBadge(u.status)}</td>
              <td>
                <div class="row-actions">
                  ${u.status === 'disabled'
                    ? `<button class="btn-xs toggle" data-action="enable" data-uid="${u.id}">تفعيل</button>`
                    : `<button class="btn-xs toggle" data-action="disable" data-uid="${u.id}">إيقاف</button>`}
                  <button class="btn-xs delete" data-action="delete" data-uid="${u.id}">حذف</button>
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;

  wrap.querySelectorAll('[data-action="disable"]').forEach((btn) => {
    btn.addEventListener('click', () => updateUserStatus(btn.dataset.uid, 'disabled'));
  });
  wrap.querySelectorAll('[data-action="enable"]').forEach((btn) => {
    btn.addEventListener('click', () => updateUserStatus(btn.dataset.uid, 'active'));
  });
  wrap.querySelectorAll('[data-action="delete"]').forEach((btn) => {
    btn.addEventListener('click', () => deleteUser(btn.dataset.uid));
  });
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
