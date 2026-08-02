// ============================================
// إعدادات Firebase
// استبدل القيم التالية بالقيم من مشروعك على Firebase Console
// Project Settings > General > Your apps > SDK setup and configuration
// ============================================
const firebaseConfig = {
  apiKey: "AIzaSyAZqE8zDace2cb0auCmI0mTe4MPF5403Uo",
  authDomain: "madical-system.firebaseapp.com",
  projectId: "madical-system",
  storageBucket: "madical-system.firebasestorage.app",
  messagingSenderId: "998766535052",
  appId: "1:998766535052:web:17a7f7fcc2aedead7276a9",
};

// تهيئة Firebase (نستخدم compat SDK ليعمل مباشرة بدون أدوات بناء)
firebase.initializeApp(firebaseConfig);

// نصدّر مرجعين نستخدمهما بباقي الملفات
const auth = firebase.auth();
const db = firebase.firestore();
// storage يُستخدم بس بالصفحات اللي تحتاجه (لوحة العيادة) بعد تحميل SDK المناسب
const storage = firebase.apps.length && firebase.storage ? firebase.storage() : null;
