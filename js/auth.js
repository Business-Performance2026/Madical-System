// ============================================
// عناصر الصفحة
// ============================================
const tabLogin = document.getElementById('tab-login');
const tabSignup = document.getElementById('tab-signup');

const nameField = document.getElementById('field-name');
const roleSelectWrap = document.getElementById('field-role');
const roleOptions = document.querySelectorAll('.role-option');

const nameInput = document.getElementById('name');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');

const submitBtn = document.getElementById('submit-btn');
const statusMsg = document.getElementById('status-msg');
const form = document.getElementById('auth-form');

let mode = 'login';       // 'login' أو 'signup'
let selectedRole = 'patient'; // 'patient' أو 'clinic'

// ============================================
// التبديل بين "تسجيل الدخول" و"إنشاء حساب"
// ============================================
tabLogin.addEventListener('click', () => setMode('login'));
tabSignup.addEventListener('click', () => setMode('signup'));

function setMode(newMode) {
  mode = newMode;
  const isSignup = mode === 'signup';

  tabLogin.classList.toggle('active', !isSignup);
  tabSignup.classList.toggle('active', isSignup);

  nameField.classList.toggle('hidden', !isSignup);
  roleSelectWrap.classList.toggle('hidden', !isSignup);

  submitBtn.textContent = isSignup ? 'إنشاء الحساب' : 'تسجيل الدخول';
  clearStatus();
}

// اختيار نوع الحساب (مريض / عيادة) عند التسجيل
roleOptions.forEach((option) => {
  option.addEventListener('click', () => {
    roleOptions.forEach((o) => o.classList.remove('selected'));
    option.classList.add('selected');
    selectedRole = option.dataset.role;
  });
});

// ============================================
// إرسال النموذج
// ============================================
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearStatus();

  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (mode === 'signup') {
    await handleSignup(email, password);
  } else {
    await handleLogin(email, password);
  }
});

// ============================================
// إنشاء حساب جديد
// ============================================
async function handleSignup(email, password) {
  const name = nameInput.value.trim();

  if (!name) {
    showStatus('فضلاً أدخل الاسم', 'error');
    return;
  }

  setLoading(true);
  try {
    const cred = await auth.createUserWithEmailAndPassword(email, password);
    const uid = cred.user.uid;

    // العيادة تحتاج موافقة الأدمن أولاً، المريض يصبح فعّال مباشرة
    const initialStatus = selectedRole === 'clinic' ? 'pending' : 'active';

    await db.collection('users').doc(uid).set({
      name: name,
      email: email,
      role: selectedRole,
      status: initialStatus,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });

    if (selectedRole === 'clinic') {
      showStatus('تم إنشاء حساب العيادة، بانتظار موافقة الإدارة', 'info');
      await auth.signOut();
      setLoading(false);
      return;
    }

    showStatus('تم إنشاء الحساب بنجاح، جاري التوجيه...', 'success');
    redirectByRole(selectedRole);
  } catch (err) {
    showStatus(translateError(err), 'error');
    setLoading(false);
  }
}

// ============================================
// تسجيل الدخول
// ============================================
async function handleLogin(email, password) {
  setLoading(true);
  try {
    const cred = await auth.signInWithEmailAndPassword(email, password);
    const uid = cred.user.uid;

    const userDoc = await db.collection('users').doc(uid).get();

    if (!userDoc.exists) {
      showStatus('تعذر العثور على بيانات الحساب', 'error');
      await auth.signOut();
      setLoading(false);
      return;
    }

    const userData = userDoc.data();

    if (userData.status === 'disabled') {
      showStatus('هذا الحساب موقوف، تواصل مع الإدارة', 'error');
      await auth.signOut();
      setLoading(false);
      return;
    }

    if (userData.role === 'clinic' && userData.status === 'pending') {
      showStatus('حساب العيادة بانتظار موافقة الإدارة', 'info');
      await auth.signOut();
      setLoading(false);
      return;
    }

    if (userData.role === 'clinic' && userData.status === 'rejected') {
      showStatus('تم رفض طلب تسجيل هذه العيادة', 'error');
      await auth.signOut();
      setLoading(false);
      return;
    }

    showStatus('تم تسجيل الدخول، جاري التوجيه...', 'success');
    redirectByRole(userData.role);
  } catch (err) {
    showStatus(translateError(err), 'error');
    setLoading(false);
  }
}

// ============================================
// التوجيه حسب نوع المستخدم
// (الصفحات التالية سيتم بناؤها لاحقاً)
// ============================================
function redirectByRole(role) {
  const destinations = {
    patient: 'patient/home.html',
    clinic: 'clinic/dashboard.html',
    admin: 'admin/dashboard.html',
  };
  setTimeout(() => {
    window.location.href = destinations[role] || 'login.html';
  }, 700);
}

// ============================================
// أدوات مساعدة
// ============================================
function setLoading(isLoading) {
  submitBtn.disabled = isLoading;
}

function showStatus(message, type) {
  statusMsg.textContent = message;
  statusMsg.className = 'status-msg ' + type;
}

function clearStatus() {
  statusMsg.textContent = '';
  statusMsg.className = 'status-msg';
}

function translateError(err) {
  const map = {
    'auth/email-already-in-use': 'هذا البريد الإلكتروني مستخدم مسبقاً',
    'auth/invalid-email': 'صيغة البريد الإلكتروني غير صحيحة',
    'auth/weak-password': 'كلمة المرور ضعيفة، استخدم 6 أحرف على الأقل',
    'auth/user-not-found': 'لا يوجد حساب بهذا البريد الإلكتروني',
    'auth/wrong-password': 'كلمة المرور غير صحيحة',
    'auth/invalid-credential': 'بيانات الدخول غير صحيحة',
    'auth/too-many-requests': 'محاولات كثيرة، حاول لاحقاً',
  };
  return map[err.code] || 'حدث خطأ، حاول مرة أخرى';
}
