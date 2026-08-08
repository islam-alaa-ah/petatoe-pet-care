# Enterprise Architecture Blueprint

## الهدف

بناء نظام CRM ومبيعات متكامل لشركة Kyum Trading Company، يبدأ بإدارة العملاء والمتابعات وعروض الأسعار، ويكون قابلًا للتوسع لاحقًا إلى أوامر البيع والفواتير والمشاريع والعقود والصيانة والشكاوى والتحصيلات والمهام والمرفقات.

## الطبقات

```text
Presentation Layer
        ↓
Application Services
        ↓
Data Access Layer
        ↓
Supabase Auth + PostgreSQL + RLS
```

## مصدر البيانات

بعد Phase 5B تكون قاعدة Supabase هي المصدر الوحيد للبيانات التشغيلية. يستخدم LocalStorage فقط لتفضيلات الواجهة والفلاتر غير الحساسة.

## الهيكل المقترح

```text
assets/js/
├── config/
│   └── supabase-config.js
├── core/
│   ├── supabase-client.js
│   ├── auth-session.js
│   ├── permissions.js
│   ├── error-handler.js
│   └── ui-state.js
├── services/
│   ├── customers-service.js
│   ├── followups-service.js
│   ├── quotations-service.js
│   ├── representatives-service.js
│   ├── dashboard-service.js
│   └── audit-service.js
├── modules/
│   ├── customers.js
│   ├── followups.js
│   ├── quotations.js
│   ├── dashboard.js
│   ├── users.js
│   └── settings.js
└── app.js
```

## دورة التشغيل

```text
Page Load
   ↓
Load Config
   ↓
Initialize Supabase
   ↓
Check Existing Session
   ↓
No Session → Login Screen
Valid Session → Load User Profile
   ↓
Apply Role Permissions
   ↓
Load Reference Data
   ↓
Load Dashboard and Active Screen
```

## قواعد معمارية

- لا يوضع Secret Key داخل GitHub Pages.
- لا تنفذ استعلامات Supabase مباشرة من عناصر الواجهة.
- كل عملية مهمة تسجل في `audit_logs`.
- RLS هي طبقة الحماية الأساسية.
- أسماء الجداول والحقول بالإنجليزية snake_case.
- النصوص المعروضة للمستخدم بالعربية.
