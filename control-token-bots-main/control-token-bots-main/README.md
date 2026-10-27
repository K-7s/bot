# Control Tokens Tool — by 7am.o

بانل Discord واحد يتحكم في كل البوتات الرسمية بتاعتك: تشغيل، فويس، حالة، رياكشن، ولوجات — من غير أي user tokens أو selfbots.

---

## 🚀 المميزات في نسخة 2.0

### 🎙️ Voice مستقل لكل بوت
- كل بوت عنده **Voice Connection مخصص له** — مخزّن في `Map<botId, VoiceConnection>`.
- كل اتصال بيتعمله `group: botId` عشان `@discordjs/voice` يعزل كل بوت لوحده.
- **تقدر تحط ٦ بوتات في نفس السيرفر (نفس الروم أو رومات مختلفة) من غير أي تعارض.**

### 🎛️ أزرار تحكم كاملة في البانل
| زرار | العمل |
|-----|-------|
| **Join Voice** | يدخل الروم |
| **Move** | ينقله لروم تاني |
| **Reconnect Now** | إعادة اتصال فورية (يشيل الـ pause التلقائي) |
| **Mute / Unmute** | صامت / يشيل |
| **Deafen / Undeafen** | يخرس / يشيل |
| **Disconnect** | يخرجه من الفويس |
| **Join All** | كل البوتات الـ Online تدخل روم واحد |

### ♻️ Auto Restart تلقائي
- لو البوت وقع Offline لأي سبب، الأداة تعيد تشغيله تلقائيًا.
- Exponential backoff (٥ ثواني، ١٠، ١٥... حتى دقيقة).
- بيتوقف بعد ٨ محاولات فاشلة متتالية عشان ما يعملش spam على Discord.
- بيرجع صفر تلقائيًا لو البوت اشتغل بثبات لمدة ٥ دقايق.

### 🎨 لوجات ملونة بإيقونات
| اللون | التصنيف | الأحداث |
|------|--------|--------|
| 🟢 Voice | خضراء | Join / Leave / Move / Mute / Deafen |
| 🔴 Error | حمراء | فشل توكن / خطأ فويس / Exceptions |
| 🟡 Restart | صفراء | إعادة تشغيل / محاولات الرجوع |
| 🔵 Login | زرقاء | Online / Added / إعدادات |

كل لوج بينزل في روم الديسكورد كـ **Embed ملون بإيقونة + بيانات مساعدة (Bot / Guild / Channel)**.

### 🖥️ UI موحد احترافي
- ثيم داكن مع أكسنت بنفسجي في البانل، الأوفرفيو، الدشبورد.
- كل الأزرار مصنّفة في صفوف منطقية (Lifecycle / Voice / Mute / Presence / Reactions).
- استخدام native components بس (Buttons, Select Menus, Modals).

---

## ⚙️ الإعداد

### 1) المتطلبات
- Node.js 18+
- بوت رئيسي في Discord Developer Portal (اسمه Controller)

### 2) التثبيت
```bash
npm install
cp .env.example .env
# املأ القيم في .env
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"  # ENCRYPTION_KEY
```

### 3) نشر الأوامر
```bash
npm run deploy     # guild deploy (فوري)
```

### 4) التشغيل
```bash
npm start          # production
npm run dev        # مع watch
```

### 5) استخدام البانل
- `/panel` — يفتح البانل الرئيسي (للـ Owner بس).
- `/setup-logs #channel` — يحدد روم اللوجات.
- من البانل: **Add Bot** → الصق التوكن الرسمي → اختار بوت → تحكم كامل.

---

## 🔐 الأمان
- التوكنات كلها مشفّرة بـ **AES-256-GCM** قبل ما تتحط في الـ database.
- `OWNER_IDS` بس اللي يقدر يستخدم البانل.
- Auto Reaction لازم عنده صلاحية **Manage Server** في السيرفر المستهدف.
- الأداة بترفض أي **User Token أو Selfbot** ورّح مباشرة.
- Rate limits على كل حاجة (رياكشن، إعادة اتصال، sweeps).

---

## 🏗️ البنية

```
src/
├── index.js                       # نقطة البداية
├── managers/
│   ├── LogManager.js              # اللوجات الملونة
│   ├── TokenManager.js            # دورة حياة البوتات + Auto Restart
│   ├── VoiceManager.js            # اتصال Voice مستقل لكل بوت
│   ├── StatusManager.js           # Rotating Status
│   └── ReactionManager.js         # Auto Reactions الآمنة
├── panels/
│   └── mainPanel.js               # كل الـ Embeds والـ Buttons
├── events/
│   └── interactionCreate.js       # معالجة كل التفاعلات
├── dashboard/
│   └── server.js                  # دشبورد Health داكن ببنفسجي
├── commands/
│   └── deploy.js                  # نشر الـ Slash Commands
└── utils/
    ├── constants.js               # ثوابت الألوان + الإيقونات
    ├── crypto.js                  # AES-256-GCM
    ├── permissions.js             # OWNER guard + Manage Server guard
    ├── rateLimiter.js             # Sliding window limiter
    ├── store.js                   # JSON atomic store
    └── banner.js                  # Boot banner
```

---

**Developed by 7am.o** — brazil!!.
