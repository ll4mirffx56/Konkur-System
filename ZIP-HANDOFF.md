# راهنمای تحویل و اجرای ZIP

## محتوای بسته

این بسته فایل‌های سورس React/TypeScript/Vite، تست‌ها، تنظیمات پروژه، سه migration مربوط به فضای ابری و راهنماهای `README.md`, `CLOUD-SETUP.md`, `ZIP-HANDOFF.md`, `CHANGELOG-INTEGRATION.md` و `TEST-REPORT.md` را دارد. فایل‌های ساخته‌شده و وابستگی‌های دانلودشده داخل ZIP نیستند.

## قبل از جایگزینی

1. در مخزن GitHub، شاخهٔ `v2-dev` را باز کن؛ `main` را برای این مرحله تغییر نده.
2. از وضعیت فعلی مخزن یا از فایل‌های مهم پشتیبان بگیر.
3. محتوای ZIP را در یک پوشهٔ محلی جدا استخراج کن و مقایسه کن؛ فایل‌های آن را بی‌بررسی روی `main` یا روی داده‌های ابری اعمال نکن.
4. متغیرهای `VITE_SUPABASE_URL` و `VITE_SUPABASE_PUBLISHABLE_KEY` را فقط با Project URL پایه (بدون `/rest/v1`) و Publishable key مقداردهی کن. هرگز `service_role` یا Secret key را به کد فرانت‌اند اضافه نکن.

## اجرای محلی

از پوشه‌ای که `package.json` داخل آن است:

```bash
npm install
npm test
npm run build
npm run preview
```

اگر `npm run build` یا تست‌ها خطا دادند، پیش از استقرار خطا باید بررسی شود. گزارش وضعیت محیط آماده‌سازی را در `TEST-REPORT.md` بخوان.

## Supabase

در SQL Editor پروژهٔ Supabase، migrationهای زیر را به ترتیب بررسی و در صورت نیاز اجرا کن:

1. `supabase/migrations/202610270001_user_app_state.sql`
2. `supabase/migrations/202610270002_enable_user_app_state_realtime.sql`
3. `supabase/migrations/202611010003_safe_user_state_compare_and_swap.sql`

Migration دوم برای دریافت تغییرات زنده از `supabase_realtime` و migration سوم برای ذخیرهٔ اتمیک و جلوگیری از بازنویسی هم‌زمان داده‌هاست. بعد از آن، ورود/ساخت حساب و دریافت و ویرایش اطلاعات با همان حساب از دو دستگاه را واقعاً آزمایش کن. پیش از واردکردن داده‌های قدیمی یا تعویض نسخه، فایل JSON یا Excel پشتیبان تهیه کن.

## انتشار

ابتدا فقط در `v2-dev` آزمایش کن. Workflow فعلی فقط شاخهٔ `main` را برای انتشار GitHub Pages در نظر می‌گیرد؛ این ZIP خودش تغییری روی مخزن یا سایت منتشرشده ایجاد نمی‌کند.
