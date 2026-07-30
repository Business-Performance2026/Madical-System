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

  renderStats(allUsers, doctorsSnap.size, bookingsSnap.size);
  renderPendingClinics(allUsers);
  renderRecentUsers(allUsers);
  renderAllUsersTable(allUsers);
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
          <button class="btn-xs delete" data-action="delete" data-uid="${u.id}">🗑️ حذف</button>
        </div>
      </td>
    </tr>
  `;
}

// صف التعديل: يفتح كل الحقول مع بعض (الاسم، البريد، ورقم الجوال للمريض)
function renderEditRow(u) {
  return `
    <tr>
      <td colspan="4">
        <div class="mini-form">
          <input type="text" class="edit-name" placeholder="الاسم" value="${escapeHtml(u.name)}">
          <input type="email" class="edit-email" placeholder="البريد الإلكتروني" value="${escapeHtml(u.email)}">
          ${u.role === 'patient' ? `<input type="tel" class="edit-phone" placeholder="رقم الجوال" value="${escapeHtml(u.phone || '')}">` : ''}
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
      drawUsersTable();
    });
  });
  wrap.querySelectorAll('[data-action="cancel-edit"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      editingUid = null;
      drawUsersTable();
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
