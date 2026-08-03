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

    // لوحة المريض - عناصر ثابتة
    welcome_prefix: 'مرحباً، ',
    tab_new_booking: 'احجز موعد جديد',
    tab_upcoming: 'مواعيدي الحالية',
    tab_past: 'مواعيدي السابقة',
    section_new_booking_title: 'احجز موعد جديد',
    section_new_booking_hint: 'اختر العيادة، بعدين الطبيب، وبنعرض لك بس الأوقات المتاحة فعلياً',
    section_upcoming_title: 'مواعيدي الحالية',
    section_past_title: 'مواعيدي السابقة',

    // خطوات الحجز
    step1_hint: 'الخطوة 1 من 3: اختر العيادة',
    step2_hint: (clinicName) => `الخطوة 2 من 3: اختر الطبيب — ${clinicName}`,
    step3_hint: (doctorName) => `الخطوة 3 من 3: اختر الموعد — د. ${doctorName}`,
    search_clinic_placeholder: 'ابحث باسم العيادة...',
    back_to_clinics: '‹ رجوع لاختيار العيادة',
    back_to_doctors: '‹ رجوع لاختيار الطبيب',
    no_active_clinics: 'ما فيه عيادات فعّالة حالياً',
    no_matching_clinics: 'ما فيه عيادات مطابقة',
    load_clinics_error: 'حدث خطأ أثناء تحميل العيادات، حدّث الصفحة وحاول مرة أخرى',
    loading_doctors: 'جاري تحميل الأطباء...',
    no_doctors_yet: 'هذي العيادة ما أضافت أطباء بعد',
    no_specialties: 'ما تم إضافة تخصصات بعد',
    rating_no_reviews: 'ما فيه تقييمات بعد',
    rating_summary: (avg, count) => `⭐ ${avg} (${count} تقييم)`,
    legend_available: 'يوجد دوام',
    legend_unavailable: 'ما يوجد دوام',
    loading_slots: 'جاري تحميل الأوقات المتاحة...',
    no_working_hours_day: '⚠️ الطبيب ما عنده دوام باليوم المختار، جرّب يوم ثاني',
    all_slots_booked: '⚠️ كل الأوقات محجوزة باليوم المختار، جرّب يوم ثاني',
    join_waitlist_btn: '🔔 انضم لقائمة الانتظار لهذا اليوم',
    confirm_booking_text: (date, time, doctorName) => `تأكيد حجز موعد يوم ${date} الساعة ${time} مع د. ${doctorName}؟`,
    booking_for_label: 'الحجز لـ',
    booking_for_self: (name) => `نفسي (${name})`,
    booking_for_new: '+ إضافة فرد جديد من العائلة',
    new_family_member_label: 'اسم الفرد الجديد',
    new_family_member_placeholder: 'مثال: سارة (الزوجة)',
    send_booking_request: 'إرسال طلب الحجز',
    sending: 'جاري الإرسال...',
    booking_error: 'حدث خطأ أثناء إرسال الطلب، حاول مرة أخرى',
    booking_success_title: '✅ تم إرسال طلب الحجز',
    booking_number_label: 'رقم حجزك',
    booking_success_note: 'بتوصلك حالته بعد ما تراجعه العيادة، وتقدر تتابعها من قسم "مواعيدي الحالية" تحت',
    modal_ok: 'تم',

    // مواعيدي
    no_upcoming_appts: 'ما فيه مواعيد قادمة حالياً',
    no_past_appts: 'ما فيه مواعيد سابقة',
    booking_number_short: 'رقم الحجز',
    status_pending: 'قيد الانتظار',
    status_accepted: 'مقبول',
    status_rejected: 'مرفوض',
    status_cancelled: 'ملغى',
    status_no_show: 'لم يحضر',
    reschedule_btn: '🔁 إعادة جدولة',
    cancel_booking_btn: 'إلغاء الحجز',
    rate_visit_btn: '⭐ قيّم زيارتك',
    confirm_cancel: 'متأكد إنك تبي تلغي هذا الحجز؟',
    cancel_error: 'تعذر إلغاء الحجز، حاول مرة أخرى',
    confirm_reschedule: 'بنلغي هذا الموعد ونوديك تختار وقت جديد لنفس الطبيب. تكمل؟',
    reschedule_doctor_error: 'تعذر جلب بيانات الطبيب، جرب تحجز من جديد يدوياً',
    reschedule_error: 'تعذر بدء إعادة الجدولة، حاول مرة أخرى',

    // نافذة التقييم
    rate_visit_title: '⭐ قيّم زيارتك',
    rating_comment_placeholder: 'تعليقك (اختياري)...',
    submit_rating: 'إرسال التقييم',
    later: 'لاحقاً',
    rating_stars_required: 'اختر تقييم من 1 إلى 5 نجوم',
    rating_error: 'تعذر إرسال التقييم، حاول مرة أخرى',

    // قائمة الانتظار
    my_waitlist_title: '🔔 قوائم انتظاري',
    waitlist_checking: 'جاري فحص التوفر...',
    waitlist_open: '🎉 فيه وقت متاح — احجز الآن',
    waitlist_still_full: '⏳ لسا مشغول',
    waitlist_already_joined: 'أنت مسجّل بقائمة الانتظار لهذا اليوم مسبقاً',
    waitlist_join_success: '✅ تم تسجيلك بقائمة الانتظار — بنعلمك أول ما يتحرر وقت بهذا اليوم',
    waitlist_joined_label: '✅ مسجّل بقائمة الانتظار',
    waitlist_join_error: 'تعذر الانضمام لقائمة الانتظار، حاول مرة أخرى',
    waitlist_leave_error: 'تعذر الإلغاء، حاول مرة أخرى',
    waitlist_cancel_btn: 'إلغاء',
    joining: 'جاري الإضافة...',

    // حساب الضيف
    guest_banner_text: '👋 أنت تستخدم حساب ضيف مؤقت — مربوط بهذا الجهاز/المتصفح بس. احفظ حسابك عشان توصل لحجوزاتك من أي جهاز ولا تخسرها.',
    save_guest_account_btn: '💾 احفظ حسابك الآن',
    save_account_title: '💾 احفظ حسابك',
    save_account_hint: 'أضف بريد إلكتروني وكلمة مرور — كل حجوزاتك الحالية تبقى معك بدون أي تغيير',
    save_account_btn: 'حفظ الحساب',
    saving: 'جاري الحفظ...',
    save_account_fields_error: 'تأكد من البريد الإلكتروني وكلمة مرور 6 أحرف على الأقل',
    save_account_success: 'تم حفظ حسابك بنجاح! تقدر تسجّل دخول بهذا البريد من أي جهاز بعدين',
    save_account_email_in_use: 'هذا البريد مستخدم مسبقاً، جرب بريد ثاني',
    save_account_invalid_email: 'صيغة البريد غير صحيحة',
    save_account_weak_password: 'كلمة المرور ضعيفة',
    save_account_error: 'تعذر حفظ الحساب، حاول مرة أخرى',
    new_booking_error: 'اكتب اسم الفرد الجديد أول',
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

    // patient dashboard - static
    welcome_prefix: 'Welcome, ',
    tab_new_booking: 'New Booking',
    tab_upcoming: 'Upcoming Appointments',
    tab_past: 'Past Appointments',
    section_new_booking_title: 'Book a New Appointment',
    section_new_booking_hint: 'Choose the clinic, then the doctor, and we\'ll show you only the actually available times',
    section_upcoming_title: 'Upcoming Appointments',
    section_past_title: 'Past Appointments',

    step1_hint: 'Step 1 of 3: Choose the clinic',
    step2_hint: (clinicName) => `Step 2 of 3: Choose the doctor — ${clinicName}`,
    step3_hint: (doctorName) => `Step 3 of 3: Choose the time — Dr. ${doctorName}`,
    search_clinic_placeholder: 'Search by clinic name...',
    back_to_clinics: '‹ Back to clinics',
    back_to_doctors: '‹ Back to doctors',
    no_active_clinics: 'No active clinics right now',
    no_matching_clinics: 'No matching clinics',
    load_clinics_error: 'Error loading clinics, refresh the page and try again',
    loading_doctors: 'Loading doctors...',
    no_doctors_yet: 'This clinic hasn\'t added any doctors yet',
    no_specialties: 'No specialties added yet',
    rating_no_reviews: 'No reviews yet',
    rating_summary: (avg, count) => `⭐ ${avg} (${count} review${count === 1 ? '' : 's'})`,
    legend_available: 'Available',
    legend_unavailable: 'Not available',
    loading_slots: 'Loading available times...',
    no_working_hours_day: '⚠️ The doctor has no working hours on this day, try another day',
    all_slots_booked: '⚠️ All times are booked on this day, try another day',
    join_waitlist_btn: '🔔 Join the waitlist for this day',
    confirm_booking_text: (date, time, doctorName) => `Confirm booking on ${date} at ${time} with Dr. ${doctorName}?`,
    booking_for_label: 'Booking for',
    booking_for_self: (name) => `Myself (${name})`,
    booking_for_new: '+ Add a new family member',
    new_family_member_label: 'New family member\'s name',
    new_family_member_placeholder: 'e.g. Sarah (wife)',
    send_booking_request: 'Send Booking Request',
    sending: 'Sending...',
    booking_error: 'Error sending the request, please try again',
    booking_success_title: '✅ Booking request sent',
    booking_number_label: 'Your booking number',
    booking_success_note: 'You\'ll be notified once the clinic reviews it, and you can track it from "Upcoming Appointments" below',
    modal_ok: 'OK',

    no_upcoming_appts: 'No upcoming appointments',
    no_past_appts: 'No past appointments',
    booking_number_short: 'Booking #',
    status_pending: 'Pending',
    status_accepted: 'Accepted',
    status_rejected: 'Rejected',
    status_cancelled: 'Cancelled',
    status_no_show: 'No-show',
    reschedule_btn: '🔁 Reschedule',
    cancel_booking_btn: 'Cancel Booking',
    rate_visit_btn: '⭐ Rate your visit',
    confirm_cancel: 'Are you sure you want to cancel this booking?',
    cancel_error: 'Could not cancel the booking, please try again',
    confirm_reschedule: 'This will cancel your current appointment and let you pick a new time with the same doctor. Continue?',
    reschedule_doctor_error: 'Could not fetch doctor data, try booking manually again',
    reschedule_error: 'Could not start rescheduling, please try again',

    rate_visit_title: '⭐ Rate your visit',
    rating_comment_placeholder: 'Your comment (optional)...',
    submit_rating: 'Submit Rating',
    later: 'Later',
    rating_stars_required: 'Choose a rating from 1 to 5 stars',
    rating_error: 'Could not submit rating, please try again',

    my_waitlist_title: '🔔 My Waitlists',
    waitlist_checking: 'Checking availability...',
    waitlist_open: '🎉 A slot is available — Book now',
    waitlist_still_full: '⏳ Still full',
    waitlist_already_joined: 'You\'re already on the waitlist for this day',
    waitlist_join_success: '✅ You\'ve joined the waitlist — we\'ll let you know once a slot opens up on this day',
    waitlist_joined_label: '✅ On the waitlist',
    waitlist_join_error: 'Could not join the waitlist, please try again',
    waitlist_leave_error: 'Could not cancel, please try again',
    waitlist_cancel_btn: 'Cancel',
    joining: 'Joining...',

    guest_banner_text: "👋 You're using a temporary guest account — tied to this device/browser only. Save your account so you can access your bookings from any device and not lose them.",
    save_guest_account_btn: '💾 Save your account now',
    save_account_title: '💾 Save Your Account',
    save_account_hint: 'Add an email and password — all your current bookings stay with you unchanged',
    save_account_btn: 'Save Account',
    saving: 'Saving...',
    save_account_fields_error: 'Make sure the email is valid and password is at least 6 characters',
    save_account_success: 'Your account has been saved! You can log in with this email from any device from now on',
    save_account_email_in_use: 'This email is already in use, try another one',
    save_account_invalid_email: 'Invalid email format',
    save_account_weak_password: 'Weak password',
    save_account_error: 'Could not save the account, please try again',
    new_booking_error: 'Type the new family member\'s name first',
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
