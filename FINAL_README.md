# Final Project – Lead Capture to CRM (Full Workflow)

This is the **Final** implementation. It extends HW3 with two new stages:
**AI-generated personalized follow-up email drafts** and **automated task creation**.

## Workflow Architecture

```
Input ({name, email, message})
  → [1] Validation (Email/Format Check)
  → [2] AI Classification (Intent + Urgency)   ← HW3
  → [3] AI Email Draft Generation              ← Final (NEW)
  → [4] Save to SQLite (leads + tasks tables)  ← Final (NEW: tasks table + email_draft column)
  → [5] Send Follow-up Email via nodemailer    ← Final (NEW, requires EMAIL_USER + EMAIL_PASS)
  → [6] Save to Google Sheets (full record)    ← Extended with email_draft + task fields
```

---

## What Changed from HW3 → Final

| Feature | HW3 | Final |
|---|---|---|
| Validation | ✅ | ✅ |
| AI Intent + Urgency | ✅ | ✅ |
| AI Email Draft | ❌ | ✅ |
| Task Creation | ❌ | ✅ |
| Email Sending (nodemailer) | ❌ | ✅ |
| `/tasks` endpoint | ❌ | ✅ |
| `/leads` endpoint | ❌ | ✅ |
| Sheets: email_draft + task columns | ❌ | ✅ |

---

## Environment Variables (.env)

```
GOOGLE_SCRIPT_URL=<your-google-apps-script-url>
GEMINI_API_KEY=<your-gemini-api-key>
EMAIL_USER=<gmail-address>         # Optional — for actual email sending
EMAIL_PASS=<gmail-app-password>    # Optional — Gmail App Password (not your login password)
```

> If `EMAIL_USER` and `EMAIL_PASS` are not set, the system still generates and **saves** the email draft to the database. No email is sent, but a task is created instead.

---

## Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/submit` | Main lead pipeline |
| `GET` | `/leads` | View all leads |
| `GET` | `/tasks` | View all follow-up tasks |

---

## How to Run

```bash
node hw3_server.js
```

Server starts on **Port 3002**.

---

## Test Cases (Postman)

### Test 1 — Invalid Email
```json
{
  "name": "Ahmet Yilmaz",
  "email": "ahmet-hatali-mail",
  "message": "Sisteme giriş yapamıyorum."
}
```
**Expected:** `status: "Invalid"`, AI and email draft skipped, errors listed.

### Test 2 — Valid Lead (Sales, High Urgency)
```json
{
  "name": "Busra Demir",
  "email": "busra@example.com",
  "message": "Şirketimiz için Enterprise paketinizle ilgileniyoruz, acil olarak fiyat teklifi alabilir miyiz?"
}
```
**Expected:** `status: "Valid"`, `intent: "Sales"`, `urgency: "High"`, personalized email draft returned, task created.

### Test 3 — Support Request
```json
{
  "name": "Can Ozturk",
  "email": "can@example.com",
  "message": "Uygulama çöktü, destek lazım acil."
}
```
**Expected:** `intent: "Support"`, `urgency: "High"`, empathetic follow-up email draft generated.

---

## Database Schema

**leads table:**
```
id, name, email, message, status, intent, urgency, email_draft, created_at
```

**tasks table:**
```
id, lead_id, title, description, priority, status, created_at
```

---

## AI Prompts Documentation

### Classification Prompt
Instructs Gemini to return `{"intent": "...", "urgency": "..."}` only, no markdown.
- Intent options: Sales, Support, Inquiry, Feedback, Partnership
- Urgency options: Low, Medium, High

### Email Draft Prompt
Instructs Gemini to write a 3-5 sentence personalized follow-up email.
- Tone is mapped to urgency: High → urgent/empathetic, Medium → professional, Low → casual/warm
- Rules enforced: no pricing promises, address by first name, professional sign-off
- Output format: `Subject: ...` then `Body: ...`
