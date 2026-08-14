# FEXUS OS — Complete Usage Guide

Ye guide bataata hai FEXUS ko kahan chalana hai, kaise start karna hai,
aur exact voice commands kya bol sakte hain.

---

## PART 1 — Kahan Chalana Hai (Setup)

FEXUS **teen alag cheezein** hain jo saath chalti hain:

| # | Cheez | Kahan | Kis liye |
|---|---|---|---|
| 1 | **Backend** | Aapka PC (server) | Database, AI, sab logic |
| 2 | **Frontend** | Aapka PC (browser mein khulta hai) | Website/dashboard jahan aap dekhte hain |
| 3 | **Local Agent** | Sirf **Windows** PC pe | Mouse/keyboard/screen control, real Desktop actions |

### Pehli baar setup karne ke exact commands

**Terminal 1 — Backend:**
```powershell
cd backend
npm install
npx prisma generate
npx prisma migrate dev --name init
npx prisma db seed
npm run dev
```
Ye `http://localhost:4000` pe chalega. Terminal ko **khula chhoड़ dein**.

**Terminal 2 — Frontend:**
```powershell
cd ..
npm install
npm run dev
```
Ye `http://localhost:5174` pe chalega. Browser mein ye URL kholein.

**Terminal 3 — Local Agent (sirf agar Windows pe mouse/keyboard/screen control chahiye):**
```powershell
cd local-agent
npm install
copy .env.example .env
npm start
```
`.env` mein pairing token daalna hoga — wo aapko FEXUS ke Owner
Dashboard → "Local PC Agent" page se milega (pehle backend+frontend
chalne chahiye, tab ye page pairing token dikhaega).

### Roz istemal karne ke liye
Har baar sirf ye 2-3 commands:
```powershell
# Terminal 1
cd backend && npm run dev

# Terminal 2
npm run dev

# Terminal 3 (agar Windows control chahiye)
cd local-agent && npm start
```

---

## PART 2 — Pehli Baar Login Kaise Karein

1. Browser mein `http://localhost:5174` kholein.
2. **Signup** karein apne real email se — jo email `backend/.env` mein
   `OWNER_EMAIL` set hai, wahi email dete waqt aap automatically
   **Owner** ban jaate hain (poora control milega). Koi aur email
   normal Company User banega.
3. Login ke baad **Owner Dashboard** khulega.

---

## PART 3 — Voice se Baat Karna Kahan Hai

Left menu mein **"Voice Agent"** (ya "Talk to Usman") page pe jaayein.

- Mic icon dabaein aur bolein: **"Usman, ..."**
- Ya neeche text box mein type kar sakte hain (agar mic na chale).
- Beech mein bolne se pehle mic ki permission browser maangega —
  Allow karein.

**Zaroori:** Voice sirf **Chrome ya Edge** browser mein kaam karti
hai. Doosre browsers mein sirf text box use hoga.

---

## PART 4 — REAL COMMANDS — Category-wise

### 🖥️ Desktop / Files (Local Agent chahiye — Windows)

| Command | Kya hoga |
|---|---|
| "Usman, meri Desktop kholo" | Real Windows Explorer khulega |
| "Usman, Desktop par ek naya folder banao naam 'Leads'" | Real folder banega |
| "Usman, Leads.txt naam ki file banao aur isme likho..." | Real file banegi, verify hogi |
| "Usman, Downloads kholo" | Real Downloads folder khulega |
| "Usman, Chrome kholo" | Real browser launch hoga |
| "Usman, ek naya tab kholo" | Real Ctrl+T |

### 🌐 Browser / Google Search

| Command | Kya hoga |
|---|---|
| "Usman, Google kholo" | Real Google.com khulega |
| "Usman, Google par search karo dental clinics in Lahore" | Real search |
| "Usman, hevizonetech.com kholo" | URL normalize hoke khulega |

⚠️ **Note**: agar `VISION_MODEL` configured nahi hai (`.env` mein), to
Usman page ke andar click/type nahi kar sakta — sirf URL khol sakta
hai. Deep clicking/typing ke liye vision model chahiye.

### 📍 Google Maps / Business Research (Google Places API chahiye)

| Command | Kya hoga |
|---|---|
| "Usman, Lahore ke interior designers research karo" | Real Google Places API call |
| "Usman, 20 dental clinics research karo Karachi mein" | Real, paginated results |
| "Usman, is data ko ek file mein save karo" | Real CSV, verify hoke |

⚠️ **Zaroori**: `backend/.env` mein `GOOGLE_PLACES_API_KEY` daalna
hoga, warna ye kaam nahi karega — Usman honestly bata dega.

### 📧 Hira — Email Campaigns

| Command | Kya hoga |
|---|---|
| "Usman, is file ko Hira ko do" | Real task, Hira ko file milegi |
| "Usman, Hira se email campaign chalwao" | Real campaign create hogi |
| "Usman, campaign ko mere sab senders mein divide karo" | Real, even distribution |
| "Usman, ab bhej do" | Real confirmation ke baad real send |

⚠️ **Zaroori**: Owner Dashboard → "Connected Emails" mein pehle sender
add/connect karna hoga, warna campaign start nahi hogi.

### 🎨 Shanza — Website AI

| Command | Kya hoga |
|---|---|
| "Usman, Shanza ko ek website banane ko bolo — dental clinic ke liye" | Real Website AI project |
| "Usman, publish kar do" | Real approval maangega, tabhi publish hoga |

⚠️ **Zaroori**: Real publish ke liye `NETLIFY_TOKEN` ya `VERCEL_TOKEN`
`.env` mein chahiye.

### ⏹️ Task Control

| Command | Kya hoga |
|---|---|
| "Usman, ruk jao" / "Usman, stop" | Real, immediate stop |
| "Usman, wapis shuru karo" / "Usman, resume" | Wahi rukey hue step se continue |
| "Usman, kya ho raha hai?" | Real, live status |

### 👥 Amina (Manager) ke through delegate karna

| Command | Kya hoga |
|---|---|
| "Amina, ye Hira ko do" | Real delegation |
| "Amina, Shanza ko batao" | Real delegation |

### 💬 WhatsApp / Facebook / Instagram / LinkedIn

| Command | Kya hoga |
|---|---|
| "Usman, WhatsApp kholo" | Real WhatsApp Web khulega |
| "Usman, LinkedIn kholo" | Real LinkedIn khulega |

⚠️ Chat padhna/reply karna sirf `VISION_MODEL` configured hone par
kaam karega, aur real confidence-gated hai (100% guarantee nahi).

### Ek Lambi, Poori Command (Multi-Step Task)

Aap ek hi saans mein poora kaam bol sakte hain:

> "Usman, Lahore mein interior designers research karo, Desktop par ek
> folder banao, data usme CSV file mein save karo, verify karo, phir
> ye file Hira ko do aur campaign prepare karwao."

Usman isko khud chhote steps mein toड़ ke, ek-ek karke, real execute
karega — aur har step ke baad short Urdu update bolega.

---

## PART 5 — Kya Configure Karna Zaroori Hai

`backend/.env` file mein ye cheezein aap khud daal sakte hain (kuch
already daali hui hain):

| Variable | Kis ke liye | Zaroori? |
|---|---|---|
| `GROQ_API_KEY` | AI (Usman ki samajh) | ✅ Zaroori |
| `GOOGLE_PLACES_API_KEY` | Maps/business research | Optional (research ke liye) |
| `VISION_MODEL` | Screen dekhna/click karna | Optional (deep browser control ke liye) |
| Connected Emails (UI se) | Email bhejna | Zaroori (campaign ke liye) |
| `NETLIFY_TOKEN`/`VERCEL_TOKEN` | Website publish karna | Optional (publish ke liye) |

Jo configure nahi hoga, Usman uske baare mein **honestly bata dega** —
kabhi fake success nahi dikhaega.

---

## PART 6 — Real Limitations (Honestly)

- Voice sirf Chrome/Edge mein kaam karti hai.
- Mouse/keyboard/screen control sirf **real Windows PC** pe kaam karta
  hai, Local Agent chalne ke saath.
- Deep browser clicking (jaise "is button pe click karo") sirf tab
  kaam karta hai jab `VISION_MODEL` configured ho, aur ye 100%
  guaranteed nahi — Usman confidence kam hone par khud mana kar dega,
  galat click nahi karega.
- 100% naya email address dhoondhna Google Maps se possible nahi
  (Google Places phone/website deta hai, email nahi).
