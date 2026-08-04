// ============================================
// التحقق من جلسة نشطة مسبقاً — لو المستخدم مسجّل دخول أصلاً (حتى لو رجع من صفحة ثانية
// زي الرئيسية أو ملف عيادة)، نوديه لحسابه مباشرة بدون ما نطلب بياناته من جديد
// ============================================
let sessionCheckHandled = false;

auth.onAuthStateChanged(async (user) => {
  if (sessionCheckHandled) return; // نتعامل مع أول تغيّر حالة بس هنا (الدخول اليدوي له مساره الخاص لاحقاً)
  sessionCheckHandled = true;

  if (!user) {
    revealLoginForm();
    return;
  }

  try {
    const userDoc = await db.collection('users').doc(user.uid).get();

    if (userDoc.exists && userDoc.data().status === 'active') {
      redirectByRole(userDoc.data().role, true);
      return;
    }
  } catch (err) {
    console.error('session check error:', err);
  }

  // حساب موقوف، أو بانتظار موافقة، أو ما لقينا بياناته — نعرض نموذج الدخول العادي
  revealLoginForm();
});

function revealLoginForm() {
  document.getElementById('session-check-loading').classList.add('hidden');
  document.getElementById('login-page-content').classList.remove('hidden');
}

// ============================================
// عناصر الصفحة
// ============================================
const tabLogin = document.getElementById('tab-login');
const tabSignup = document.getElementById('tab-signup');

const nameField = document.getElementById('field-name');
const phoneField = document.getElementById('field-phone');
const emailField = document.getElementById('field-email');
const passwordField = document.getElementById('field-password');
const roleSelectWrap = document.getElementById('field-role');
const roleOptions = document.querySelectorAll('.role-option');
const guestToggleBtn = document.getElementById('guest-toggle-btn');
const forgotPasswordBtn = document.getElementById('forgot-password-btn');
const modeSwitchWrap = document.querySelector('.mode-switch');

const nameInput = document.getElementById('name');
const phoneInput = document.getElementById('phone');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');

const submitBtn = document.getElementById('submit-btn');
const statusMsg = document.getElementById('status-msg');
const form = document.getElementById('auth-form');

let mode = 'login';       // 'login' أو 'signup' أو 'guest'
let selectedRole = 'patient'; // 'patient' أو 'clinic'

// ============================================
// التبديل بين "تسجيل الدخول" و"إنشاء حساب" و"ضيف"
// ============================================
tabLogin.addEventListener('click', () => setMode('login'));
tabSignup.addEventListener('click', () => setMode('signup'));
guestToggleBtn.addEventListener('click', () => setMode(mode === 'guest' ? 'login' : 'guest'));

function setMode(newMode) {
  mode = newMode;
  const isSignup = mode === 'signup';
  const isGuest = mode === 'guest';

  modeSwitchWrap.classList.toggle('hidden', isGuest);
  forgotPasswordBtn.classList.toggle('hidden', isSignup || isGuest);

  tabLogin.classList.toggle('active', !isSignup && !isGuest);
  tabSignup.classList.toggle('active', isSignup);

  nameField.classList.toggle('hidden', !isSignup && !isGuest);
  roleSelectWrap.classList.toggle('hidden', !isSignup);
  emailField.classList.toggle('hidden', isGuest);
  passwordField.classList.toggle('hidden', isGuest);
  updatePhoneVisibility();
  updateGuestButtonVisibility();

  if (isGuest) {
    submitBtn.textContent = t('submit_guest');
    guestToggleBtn.textContent = t('guest_toggle_hide');
  } else {
    submitBtn.textContent = isSignup ? t('submit_signup') : t('submit_login');
    guestToggleBtn.textContent = t('guest_toggle_show');
  }

  clearStatus();
}

// حقل رقم الجوال يظهر عند تسجيل أي حساب جديد (مريض أو عيادة) أو وضع الضيف
function updatePhoneVisibility() {
  const showPhone = mode === 'signup' || mode === 'guest';
  phoneField.classList.toggle('hidden', !showPhone);
}

// اختيار نوع الحساب (مريض / عيادة) عند التسجيل
roleOptions.forEach((option) => {
  option.addEventListener('click', () => {
    roleOptions.forEach((o) => o.classList.remove('selected'));
    option.classList.add('selected');
    selectedRole = option.dataset.role;
    updatePhoneVisibility();
    updateGuestButtonVisibility();
  });
});

// زر "احجز كضيف" يظهر بوضع تسجيل الدخول دايماً، وبوضع إنشاء حساب بس لو المختار "مريض"
// (ما له داعي للعيادات - تسجيل عيادة يحتاج حساب حقيقي دايماً)
function updateGuestButtonVisibility() {
  const shouldShow = mode !== 'guest' && (mode !== 'signup' || selectedRole === 'patient');
  guestToggleBtn.classList.toggle('hidden', !shouldShow);
}

// لو المستخدم بدّل اللغة ونحن بوضع "ضيف"، نحدّث نص الأزرار بنفس الوضع الحالي
function onLanguageChanged() {
  if (mode === 'guest') {
    submitBtn.textContent = t('submit_guest');
    guestToggleBtn.textContent = t('guest_toggle_hide');
  } else {
    submitBtn.textContent = mode === 'signup' ? t('submit_signup') : t('submit_login');
    guestToggleBtn.textContent = t('guest_toggle_show');
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
// نسيت كلمة المرور: بوب أب مستقل يطلب البريد بس
// ============================================
forgotPasswordBtn.addEventListener('click', () => {
  showModal(`
    <h3>${t('forgot_password_title')}</h3>
    <p class="cell-sub">${t('forgot_password_hint')}</p>
    <div class="field">
      <label for="reset-email">${t('label_email')}</label>
      <input type="email" id="reset-email" placeholder="example@email.com" value="${escapeHtml(emailInput.value.trim())}">
    </div>
    <button type="button" class="btn-primary" id="submit-reset-btn">${t('send_reset_link')}</button>
    <p class="status-msg" id="reset-status-msg"></p>
  `);

  document.getElementById('submit-reset-btn').addEventListener('click', handleForgotPassword);
  document.getElementById('reset-email').focus();
});

async function handleForgotPassword() {
  const email = document.getElementById('reset-email').value.trim();
  const btn = document.getElementById('submit-reset-btn');
  const resetStatus = document.getElementById('reset-status-msg');

  if (!email) {
    resetStatus.textContent = t('err_enter_email');
    resetStatus.className = 'status-msg error';
    return;
  }

  btn.disabled = true;
  btn.textContent = t('sending');

  try {
    await auth.sendPasswordResetEmail(email);
    resetStatus.textContent = t('reset_link_sent');
    resetStatus.className = 'status-msg success';
    btn.textContent = t('send_reset_link');
    btn.disabled = false;
  } catch (err) {
    resetStatus.textContent = translateError(err);
    resetStatus.className = 'status-msg error';
    btn.textContent = t('send_reset_link');
    btn.disabled = false;
  }
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
// إرسال النموذج
// ============================================
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearStatus();

  if (mode === 'guest') {
    await handleGuestBooking();
    return;
  }

  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (mode === 'signup') {
    await handleSignup(email, password);
  } else {
    await handleLogin(email, password);
  }
});

// ============================================
// حجز كضيف (بدون بريد إلكتروني ولا كلمة مرور) - حساب مؤقت عبر Firebase Anonymous Auth
// ============================================
async function handleGuestBooking() {
  const name = nameInput.value.trim();
  if (!name) {
    showStatus(t('err_enter_name'), 'error');
    return;
  }

  const phone = phoneInput.value.trim();
  if (!phone) {
    showStatus(t('err_enter_phone'), 'error');
    return;
  }
  if (!/^[0-9+\s-]{8,15}$/.test(phone)) {
    showStatus(t('err_invalid_phone'), 'error');
    return;
  }

  setLoading(true);
  try {
    await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
    const cred = await auth.signInAnonymously();
    const uid = cred.user.uid;

    await db.collection('users').doc(uid).set({
      name: name,
      email: '',
      role: 'patient',
      status: 'active',
      phone: phone,
      isGuest: true,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });

    showStatus(t('msg_guest_success'), 'success');
    redirectByRole('patient');
  } catch (err) {
    showStatus(translateError(err), 'error');
    setLoading(false);
  }
}

// ============================================
// إنشاء حساب جديد
// ============================================
async function handleSignup(email, password) {
  const name = nameInput.value.trim();

  if (!name) {
    showStatus(t('err_enter_name'), 'error');
    return;
  }

  const phone = phoneInput.value.trim();
  if (!phone) {
    showStatus(t('err_enter_phone'), 'error');
    return;
  }
  if (!/^[0-9+\s-]{8,15}$/.test(phone)) {
    showStatus(t('err_invalid_phone'), 'error');
    return;
  }

  setLoading(true);
  try {
    await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
    const cred = await auth.createUserWithEmailAndPassword(email, password);
    const uid = cred.user.uid;

    // العيادة تحتاج موافقة الأدمن أولاً، المريض يصبح فعّال مباشرة
    const initialStatus = selectedRole === 'clinic' ? 'pending' : 'active';

    const userData = {
      name: name,
      email: email,
      role: selectedRole,
      status: initialStatus,
      phone: phone,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    };

    await db.collection('users').doc(uid).set(userData);

    if (selectedRole === 'clinic') {
      showStatus(t('msg_clinic_pending'), 'info');
      await auth.signOut();
      setLoading(false);
      return;
    }

    showStatus(t('msg_account_created'), 'success');
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
    await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
    const cred = await auth.signInWithEmailAndPassword(email, password);
    const uid = cred.user.uid;

    const userDoc = await db.collection('users').doc(uid).get();

    if (!userDoc.exists) {
      showStatus(t('err_account_not_found'), 'error');
      await auth.signOut();
      setLoading(false);
      return;
    }

    const userData = userDoc.data();

    if (userData.status === 'disabled') {
      showStatus(t('err_account_disabled'), 'error');
      await auth.signOut();
      setLoading(false);
      return;
    }

    if (userData.role === 'clinic' && userData.status === 'pending') {
      showStatus(t('msg_clinic_awaiting'), 'info');
      await auth.signOut();
      setLoading(false);
      return;
    }

    if (userData.role === 'clinic' && userData.status === 'rejected') {
      showStatus(t('err_clinic_rejected'), 'error');
      await auth.signOut();
      setLoading(false);
      return;
    }

    showStatus(t('msg_login_success'), 'success');
    redirectByRole(userData.role);
  } catch (err) {
    showStatus(translateError(err), 'error');
    setLoading(false);
  }
}

// ============================================
// التوجيه حسب نوع المستخدم
// ============================================
function redirectByRole(role, immediate) {
  const destinations = {
    patient: 'patient/home.html',
    clinic: 'clinic/dashboard.html',
    staff: 'clinic/dashboard.html',
    admin: 'admin/dashboard.html',
  };

  let destination = destinations[role] || 'login.html';

  const params = new URLSearchParams();

  // لو المستخدم دخل من رابط حجز مباشر لعيادة معيّنة، نمرر نفس المعامل بعد تسجيل الدخول
  const clinicParam = new URLSearchParams(window.location.search).get('clinic');
  if (clinicParam && role === 'patient') params.set('clinic', clinicParam);

  // لو المستخدم جاي من رابط يطلب تبويب معيّن (مواعيدي/حسابي من الشريط السفلي مثلاً)
  const tabParam = new URLSearchParams(window.location.search).get('tab');
  if (tabParam && role === 'patient') params.set('tab', tabParam);

  const queryString = params.toString();
  if (queryString) destination += `?${queryString}`;

  if (immediate) {
    window.location.href = destination;
    return;
  }

  setTimeout(() => {
    window.location.href = destination;
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
    'auth/email-already-in-use': t('err_email_in_use'),
    'auth/invalid-email': t('err_invalid_email'),
    'auth/weak-password': t('err_weak_password'),
    'auth/user-not-found': t('err_user_not_found'),
    'auth/wrong-password': t('err_wrong_password'),
    'auth/invalid-credential': t('err_invalid_credential'),
    'auth/too-many-requests': t('err_too_many_requests'),
  };
  return map[err.code] || t('err_generic');
}
