# ساخت اپلیکیشن اندروید (FAB STEEL VIEWER)

۱. Android Studio (نسخه جدید) را نصب کنید.
۲. `File ▸ Open` و پوشه `android` همین بسته را انتخاب کنید. بار اول اینترنت لازم است؛ صبر کنید Gradle Sync تمام شود.
۳. برای APK قابل نصب: `Build ▸ Build Bundle(s) / APK(s) ▸ Build APK(s)`.
   فایل: `android/app/build/outputs/apk/debug/app-debug.apk` (روی گوشی کپی و نصب کنید؛ نصب از منبع ناشناس را مجاز کنید).
۴. فایل `.fabsteel` را از تلگرام/واتساپ «Open with ▸ FAB STEEL VIEWER» کنید، یا در صفحه اصلی «باز کردن فایل» را بزنید.

صفحه اصلی برنامه همان تصویر منو است؛ دکمه Back در هر بخش به صفحه اصلی برمی‌گردد.
هر بار `viewer/build.js` را اجرا می‌کنید، فایل `FabSteelViewer.html` را در `android/app/src/main/assets` هم کپی کنید.
