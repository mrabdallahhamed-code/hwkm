# حوكم (HWKM) — منصة الحوكمة المؤسسية

موقع ثابت (HTML + CSS + JavaScript عادي، بلا إطار عمل) يُخدَّم من GitHub Pages عبر النطاق hwkm.net وCloudflare، وخلفيته على **Supabase** (قاعدة بيانات + مصادقة + تخزين + دوال سيرفر).

> هذا المستودع **عام**. لا يوضع فيه أي سرّ ولا ملفات SQL ولا إيميلات. الخلفية (SQL ودوال السيرفر) في مستودع خاص منفصل اسمه `hwkm-db`.

## الهيكل
| المسار | ما فيه |
|---|---|
| `index.html` | الصفحة الرئيسية وكل نوافذ النماذج |
| `style.css` | كل التنسيقات (لكل ميزة بادئة خاصة: `pk-` `cr-` `pd-` `ms-` `cd-`) |
| `js/*.js` | منطق المنصة: 80 ملفًا، لكل ملف موضوع واحد (انظر «خريطة الملفات» أدناه). الملفات تعمل في نطاق عام واحد (بلا وحدات)، فالترتيب في `index.html` هو المرجع |
| `sw.js` | عامل الخدمة (التخزين المؤقت) |
| `tests/run.js` | الاختبارات الآلية (Playwright مع Supabase وهمي) |
| `scripts/` | فحص الأسماء غير المعرّفة، وبناء نسخة مصغّرة |
| `.github/workflows/ci.yml` | يشغّل الفحص والاختبارات عند كل رفع |

## التشغيل والاختبار
```
npm install
npx playwright install chromium
npm run verify     # فحص الأسماء + الاختبارات + البناء
```
- `npm run check` يكشف الأسماء المكتوبة بخطأ، و`npm test` يشغّل الاختبارات.
- يجب أن ينجح الاثنان قبل أي رفع.

## قواعد العمل
1. **رقم الإصدار:** عند تعديل ملف في `js/` أو `style.css` ارفع رقمه في `index.html` (مثلًا `?v=100` إلى `?v=101`) وإلا قد يرى المستخدمون النسخة القديمة.
2. **أي تغيير يحتاج جدولًا أو دالة في قاعدة البيانات** يُكتب SQL ويُنفَّذ يدويًا أولًا في Supabase (ويحفظ في `hwkm-db`)، ثم يُرفع الكود المعتمد عليه.
3. **الأمان:** كل جدول عليه RLS. مفتاح Supabase في `js/01` هو المفتاح العام (anon) فقط. لا يوضع مفتاح الخدمة (service role) هنا أبدًا.
4. **الأسماء:** لا تُكتب أسماء أشخاص حقيقيين في الواجهة العامة.
5. **الواجهة:** تصميم هادئ، عربي من اليمين لليسار، وكل نص موجّه للمستخدم بالعربية.
6. **الإضافات على الحقول الحساسة** تمر عبر دوال `security definer` في قاعدة البيانات، لا عبر تعديل مباشر من المتصفح.

## النشر
الرفع إلى فرع `main` ينشر تلقائيًا على GitHub Pages خلال دقائق. التخزين المؤقت للصفحة الرئيسية نحو 10 دقائق، فقد يلزم تحديث قوي (Ctrl+Shift+R).

## الخلفية
- قاعدة البيانات: Supabase (كل الجداول عليها RLS).
- دوال السيرفر: `send-notification-email`، `create-test-user`، `verify-commercial-registration` (كودها في `hwkm-db/edge`).
- الإيميلات عبر Resend. التحقق من السجل التجاري عبر وثّق (وزارة التجارة).
- الرؤوس الأمنية وسياسة CSP تُضبط في Cloudflare (Transform Rules).

## خريطة الملفات (js/)
> **ترتيب التحميل هو الترتيب في `index.html` وليس ترتيب الأرقام.** الأرقام من 20 فما فوق (والأرقام 77–81 فُصلت من ملف 01 وتأتي بعده مباشرة) ملفات فُصلت لاحقًا من ملفات أقدم، وأُدرجت بعد أصلها مباشرة حتى لا يتغير الترتيب. مهم خصوصًا: `49-ui-dialogs.js` يستبدل `alert/confirm` عند التحميل، فيجب أن يبقى بعد `17-criteria-banks-admin.js`.

**الأساس والدخول**
- `01-supabase-config-const.js`: إعداد Supabase وكلمة التحقق Turnstile ودالة تنظيف النصوص المبكرة.
- `77-i18n-english-layer.js`: طبقة الترجمة الإنجليزية. `78-client-hygiene-upload.js`: عميل Supabase وتنظيف المدخلات ورفع الملفات.
- `79-auth-login-profile.js`: تسجيل الدخول والتسجيل ونفاذ والموافقة على الشروط وتحميل ملف المستخدم. `80-roles-permissions.js`: الأدوار والصلاحيات وصفحات كل دور. `81-view-only-enforcement.js`: وضع «العرض فقط» لعضو المجلس.
- `04-auth-mfa-session.js`: التحقق بخطوتين، الخروج التلقائي، دليل البداية، نسيان كلمة المرور، فحص الجلسة.
- `39-phone-verification.js`: تأكيد الجوال. `42-users-permissions.js`: المستخدمون وصلاحيات الصفحات. `43-company-switching.js`: التبديل بين الشركات. `41-activity-log.js`: سجل النشاط. `02-team-invites.js`: دعوات الفريق. `40-company-join-code.js`: كود الشركة وطلبات الانضمام.

**الشركات والاشتراكات (ومالك المنصة)**
- `03-archive-company-subscription.js`: الأرشيف، نافذة الشركة، الاشتراك وشريط التجربة. `36-company-onboarding.js`: تسجيل شركة جديدة (ومنه خيار «شكل آخر»). `37-platform-owner.js`: لوحة مالك المنصة وفريقها. `38-platform-owner-companies.js`: إدارة الشركات والتجربة والاشتراكات ومراجعة الطلبات. `21-cr-verification.js`: استعلام وثّق (للمالك فقط).

**الاجتماعات والقرارات**
- `74-meetings-core.js`، `05-annual-meeting-plan.js`، `55-board-minutes.js`، `56-meeting-decisions-voting.js`، `57-meeting-cards.js`، `08-meeting-requests.js`، `54-committee-meetings.js`، `29-committees.js`، `73-board-members.js` (أعضاء المجلس وتجديد الدورة)، `45-decisions.js` (متابعة القرارات والقرارات البسيطة)، `52-circulation-resolutions.js` (قرارات التمرير).

**الجمعية العامة والمساهمون**
- `06-agm-cards-detail.js` (البطاقات والتفاصيل)، `53-board-election.js` (انتخاب المجلس)، `66-agm-attendance.js` (الحضور وتقرير التصويت PDF)، `51-agm-quorum-majority.js` (النصاب والأغلبيات)، `19-official-agm-documents.js` (مستندات الجمعية الرسمية)، `64-board-disclosure-form.js` (نموذج إفصاح الأعضاء)، `65-document-templates.js` (قوالب Word)، `35-global-search-shareholders.js` (سجل المساهمين والبحث)، `75-announcement-types-registry.js` (سجل أنواع إعلانات هيئة السوق المالية: بيانات فقط)، `07-announcement-engine.js` (محرك الإعلانات)، `76-announcements-page.js`.

**السياسات والإجراءات والهيكل**
- `60-policies.js`، `61-policy-board-review.js`، `62-policy-workflow.js`، `48-policy-comments.js`، `47-procedures.js`، `17-criteria-banks-admin.js` (بنوك المعايير)، `30-org-structure.js` (الهيكل التنظيمي)، `31-job-descriptions.js` (الوصف الوظيفي والاقتراح الذكي)، `28-permissions-matrix.js` (مصفوفة الصلاحيات)، `63-generic-helpers.js` (مساعدات صغيرة ومتغيرات المخاطر).

**الموافقات والتوقيع**
- `34-governance-approvals.js` (محرك موافقات الحوكمة)، `10-esignature.js`، `68-permanent-signature.js`، `69-official-doc-signing.js`، `70-role-based-signing.js`، `18-board-member-review.js` (مراجعة أعضاء المجلس لطلبات التعيين وتصويت المساهمين)، `67-pdf-canvas-builder.js` (بناء PDF عربي متعدد الصفحات).

**التقييم والامتثال والمخاطر والتدقيق**
- `14-votes-assessment.js` (التصويت وتقييم فعالية الحوكمة)، `50-assessment-evidence-independence.js` (الأدلة التلقائية وفحص الاستقلالية)، `20-gap-report.js` (تقرير الفجوات)، `24-corrective-actions.js`، `09-compliance.js`، `71-internal-governance-evaluation.js`، `16-performance-evaluations.js`، `46-governance-links.js`، `25-audit-services.js` و`15-audit-back-office.js` (التدقيق: العميل والإدارة الخلفية)، `26-risk-services.js` و`27-risk-back-office.js` (المخاطر)، `58-consultation-requests.js`، `59-provider-marketplace.js`.

**التقارير والتصدير والتنبيهات**
- `22-dashboard-alerts.js` (اللوحة والإشعارات والتنبيهات الاستباقية)، `32-indicators-report.js` (المؤشرات المالية والتشغيلية)، `44-annual-report.js` (التقرير السنوي)، `11-exports-and-search.js` (التصدير إلى Excel/PDF واستيراد المساهمين)، `13-pdf-import-best.js` (استيراد PDF)، `23-support-export.js` (الدعم الفني وتصدير بيانات الشركة)، `12-email-sms-notifications.js` (الإيميلات ورمز الجوال)، `33-calendar-whatsapp.js`.

## ملاحظة للمبرمج
- `13-pdf-import-best.js` (649 سطرًا) تُرك دون فصل عن قصد: موضوعه واحد (استيراد PDF) وحجمه معقول. قاعدة الفصل في هذا المشروع: يُفصل الملف حين يجمع مواضيع مختلفة، لا حين يكبر وحده.
- دالة الاقتراح الذكي (`suggest-job-description`) تعمل في Supabase وتعتمد على نماذج Gemini المجانية التي تتقاعد كل بضعة أشهر؛ عند فشلها راجع سجل الدالة (سطور `gemini`). وهي غير موجودة بعد في `hwkm-db/edge`.
