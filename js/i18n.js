// ============================================
// وحدة الترجمة المشتركة (عربي / إنجليزي)
// تُحمَّل قبل أي ملف جافاسكريبت ثاني بالصفحة
// نفس مفتاح localStorage المستخدم بالشاشة الرئيسية (mawid_lang) عشان الاختيار يبقى متسق بكل التطبيق
// ============================================
const I18N = {
  ar: {
    // مشترك بين صفحات كثيرة
    logout: 'تسجيل الخروج',
    cancel: 'إلغاء',
    save: 'حفظ',
    loading: 'جاري التحميل...',

    // صفحة تسجيل الدخول
    brand_subtitle: 'احجز موعدك بسهولة وأمان',
    tab_login: 'تسجيل الدخول',
    tab_signup: 'إنشاء حساب',
    label_name: 'الاسم الكامل',
    placeholder_name: 'مثال: أحمد محمد',
    label_account_type: 'نوع الحساب',
    role_patient: 'مريض',
    role_clinic: 'عيادة',
    label_phone: 'رقم الجوال (واتساب)',
    label_email: 'البريد الإلكتروني',
    label_password: 'كلمة المرور',
    placeholder_password: '6 أحرف على الأقل',
    submit_login: 'تسجيل الدخول',
    submit_signup: 'إنشاء الحساب',
    submit_guest: 'متابعة كضيف والحجز الآن',
    guest_toggle_show: 'أو احجز كضيف بدون تسجيل ←',
    guest_toggle_hide: '← رجوع لتسجيل الدخول',
    footer_disclaimer: 'تسجيل حسابات العيادات يتطلب موافقة الإدارة قبل التفعيل',

    // رسائل auth.js
    err_enter_name: 'فضلاً أدخل الاسم',
    err_enter_phone: 'فضلاً أدخل رقم الجوال (واتساب)',
    err_invalid_phone: 'صيغة رقم الجوال غير صحيحة',
    msg_clinic_pending: 'تم إنشاء حساب العيادة، بانتظار موافقة الإدارة',
    msg_account_created: 'تم إنشاء الحساب بنجاح، جاري التوجيه...',
    msg_login_success: 'تم تسجيل الدخول، جاري التوجيه...',
    msg_guest_success: 'تم، جاري التوجيه للحجز...',
    err_account_not_found: 'تعذر العثور على بيانات الحساب',
    err_account_disabled: 'هذا الحساب موقوف، تواصل مع الإدارة',
    msg_clinic_awaiting: 'حساب العيادة بانتظار موافقة الإدارة',
    err_clinic_rejected: 'تم رفض طلب تسجيل هذه العيادة',
    err_email_in_use: 'هذا البريد الإلكتروني مستخدم مسبقاً',
    err_invalid_email: 'صيغة البريد الإلكتروني غير صحيحة',
    err_weak_password: 'كلمة المرور ضعيفة، استخدم 6 أحرف على الأقل',
    err_user_not_found: 'لا يوجد حساب بهذا البريد الإلكتروني',
    err_wrong_password: 'كلمة المرور غير صحيحة',
    err_invalid_credential: 'بيانات الدخول غير صحيحة',
    err_too_many_requests: 'محاولات كثيرة، حاول لاحقاً',
    err_generic: 'حدث خطأ، حاول مرة أخرى',
  },
  en: {
    logout: 'Logout',
    cancel: 'Cancel',
    save: 'Save',
    loading: 'Loading...',

    brand_subtitle: 'Book your appointment easily and securely',
    tab_login: 'Login',
    tab_signup: 'Sign Up',
    label_name: 'Full Name',
    placeholder_name: 'e.g. John Smith',
    label_account_type: 'Account Type',
    role_patient: 'Patient',
    role_clinic: 'Clinic',
    label_phone: 'Phone Number (WhatsApp)',
    label_email: 'Email',
    label_password: 'Password',
    placeholder_password: 'At least 6 characters',
    submit_login: 'Login',
    submit_signup: 'Create Account',
    submit_guest: 'Continue as Guest & Book Now',
    guest_toggle_show: 'Or book as guest without registering ←',
    guest_toggle_hide: '← Back to login',
    footer_disclaimer: 'Clinic accounts require admin approval before activation',

    err_enter_name: 'Please enter your name',
    err_enter_phone: 'Please enter your phone number (WhatsApp)',
    err_invalid_phone: 'Invalid phone number format',
    msg_clinic_pending: 'Clinic account created, awaiting admin approval',
    msg_account_created: 'Account created successfully, redirecting...',
    msg_login_success: 'Logged in successfully, redirecting...',
    msg_guest_success: 'Done, redirecting to booking...',
    err_account_not_found: 'Could not find account data',
    err_account_disabled: 'This account is disabled, contact admin',
    msg_clinic_awaiting: 'Clinic account is awaiting admin approval',
    err_clinic_rejected: 'This clinic registration was rejected',
    err_email_in_use: 'This email is already in use',
    err_invalid_email: 'Invalid email format',
    err_weak_password: 'Weak password, use at least 6 characters',
    err_user_not_found: 'No account found with this email',
    err_wrong_password: 'Incorrect password',
    err_invalid_credential: 'Invalid login credentials',
    err_too_many_requests: 'Too many attempts, try again later',
    err_generic: 'An error occurred, please try again',
  },
};

let currentLang = localStorage.getItem('mawid_lang') || 'ar';

function t(key, ...args) {
  const entry = (I18N[currentLang] && I18N[currentLang][key] !== undefined)
    ? I18N[currentLang][key]
    : (I18N.ar[key] !== undefined ? I18N.ar[key] : key);
  return typeof entry === 'function' ? entry(...args) : entry;
}

// تطبق الترجمة على كل عناصر الصفحة اللي عندها data-i18n / data-i18n-placeholder،
// وتحدّث اتجاه الصفحة، وتستدعي onLanguageChanged() لو الصفحة عرّفتها (لإعادة رسم محتوى حي)
function applyLanguageGlobal() {
  document.documentElement.setAttribute('lang', currentLang);
  document.documentElement.setAttribute('dir', currentLang === 'ar' ? 'rtl' : 'ltr');

  document.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });

  if (typeof onLanguageChanged === 'function') onLanguageChanged();
}

function toggleLanguage() {
  currentLang = currentLang === 'ar' ? 'en' : 'ar';
  localStorage.setItem('mawid_lang', currentLang);
  applyLanguageGlobal();
}

document.addEventListener('DOMContentLoaded', () => {
  const toggleBtn = document.getElementById('lang-toggle-btn');
  if (toggleBtn) toggleBtn.addEventListener('click', toggleLanguage);
  applyLanguageGlobal();
});
