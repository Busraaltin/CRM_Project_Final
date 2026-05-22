require('dotenv').config();
const http = require('http');
const sqlite3 = require('sqlite3').verbose();
const nodemailer = require('nodemailer');

const PORT = 3002;

// ─── Database Setup ──────────────────────────────────────────────────────────
const db = new sqlite3.Database('./database_hw3.sqlite', (err) => {
  if (err) {
    console.error("❌ Veritabanı bağlantı hatası:", err.message);
  } else {
    console.log("🟢 SQLite Veritabanı başarıyla bağlandı (database_hw3.sqlite)");

    // leads tablosu (email_draft kolonu eklendi - Final)
    db.run(`CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      email TEXT,
      message TEXT,
      status TEXT,
      intent TEXT,
      urgency TEXT,
      email_draft TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, (err) => {
      if (err) console.error("Leads tablo hatası:", err.message);
      else console.log("🟢 'leads' tablosu hazır.");
    });

    // tasks tablosu (Final - yeni eklendi)
    db.run(`CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id INTEGER,
      title TEXT,
      description TEXT,
      priority TEXT,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(lead_id) REFERENCES leads(id)
    )`, (err) => {
      if (err) console.error("Tasks tablo hatası:", err.message);
      else console.log("🟢 'tasks' tablosu hazır.");
    });
  }
});

const GOOGLE_SCRIPT_URL = process.env.GOOGLE_SCRIPT_URL;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;

// ─── Step 1: Validation ───────────────────────────────────────────────────────
function validatePayload(payload) {
  const errors = [];
  if (!payload.name || payload.name.trim() === '') errors.push("Name is missing.");
  if (!payload.email || payload.email.trim() === '') errors.push("Email is missing.");
  if (!payload.message || payload.message.trim() === '') errors.push("Message is missing.");

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (payload.email && !emailRegex.test(payload.email)) {
    errors.push("Invalid email format.");
  }

  return { isValid: errors.length === 0, errors };
}

// ─── Step 2: AI Classification (Intent + Urgency) ────────────────────────────
async function analyzeWithGemini(message) {
  if (!GEMINI_API_KEY || GEMINI_API_KEY === 'X') {
    console.log("⚠️ Gemini API key eksik. Fallback aktif.");
    return { intent: "Unknown", urgency: "Medium" };
  }

  const prompt = `Analyze the following customer message.
Determine the 'intent' (e.g., Sales, Support, Inquiry, Feedback, Partnership) and the 'urgency' (Low, Medium, High).
Return ONLY a valid JSON object with the keys "intent" and "urgency". No markdown, no explanation.

Message: "${message}"`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });

    const data = await response.json();

    if (data.candidates && data.candidates.length > 0) {
      let aiText = data.candidates[0].content.parts[0].text;
      aiText = aiText.replace(/```json/g, "").replace(/```/g, "").trim();
      return JSON.parse(aiText);
    } else {
      return smartFallback(message);
    }
  } catch (error) {
    console.error("❌ AI Classification Error:", error.message);
    return smartFallback(message);
  }
}

function smartFallback(message) {
  const msg = message.toLowerCase();
  if (msg.includes("support") || msg.includes("çöktü") || msg.includes("hata")) return { intent: "Support", urgency: "High" };
  if (msg.includes("fiyat") || msg.includes("enterprise") || msg.includes("sales")) return { intent: "Sales", urgency: "High" };
  if (msg.includes("öneri") || msg.includes("feedback") || msg.includes("güzel")) return { intent: "Feedback", urgency: "Low" };
  if (msg.includes("partner") || msg.includes("işbirliği")) return { intent: "Partnership", urgency: "Medium" };
  return { intent: "Inquiry", urgency: "Medium" };
}

// ─── Step 3: AI Email Draft Generation (Final - yeni) ────────────────────────
async function generateFollowUpEmail(name, message, intent, urgency) {
  if (!GEMINI_API_KEY || GEMINI_API_KEY === 'X') {
    return buildFallbackEmail(name, intent, urgency);
  }

  const toneGuide = {
    High: "urgent and empathetic, respond quickly",
    Medium: "professional and friendly",
    Low: "casual and warm"
  };

  const prompt = `You are a professional customer success representative.
Write a personalized follow-up email to a lead based on the information below.

Lead Name: ${name}
Lead Message: "${message}"
Detected Intent: ${intent}
Detected Urgency: ${urgency}
Tone: ${toneGuide[urgency] || "professional and friendly"}

Rules:
- Start with "Subject:" on the first line
- Then a blank line, then "Body:"
- The email body should be 3-5 sentences max
- Address the lead by first name
- Match the tone to the urgency level
- Do NOT make promises about pricing or guarantees
- End with a professional sign-off from "The Team"

Return only the Subject and Body. No extra explanation.`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });

    const data = await response.json();

    if (data.candidates && data.candidates.length > 0) {
      return data.candidates[0].content.parts[0].text.trim();
    }
    return buildFallbackEmail(name, intent, urgency);
  } catch (error) {
    console.error("❌ Email Draft Generation Error:", error.message);
    return buildFallbackEmail(name, intent, urgency);
  }
}

function buildFallbackEmail(name, intent, urgency) {
  const firstName = name.split(' ')[0];
  return `Subject: Following Up on Your ${intent} Inquiry

Body:
Dear ${firstName},

Thank you for reaching out to us. We have received your message and our team is reviewing it with ${urgency.toLowerCase()} priority.

We will get back to you shortly with the information you need. Please don't hesitate to reach out if you have any additional questions.

Best regards,
The Team`;
}

// ─── Step 4: Create Task (Final - yeni) ──────────────────────────────────────
function createTask(leadId, name, intent, urgency) {
  const priorityMap = { High: 'high', Medium: 'medium', Low: 'low' };
  const title = `Follow up: ${name} — ${intent} (${urgency} priority)`;
  const description = `Lead ID #${leadId} classified as ${intent}. Review email draft and send personalized response. Urgency: ${urgency}.`;
  const priority = priorityMap[urgency] || 'medium';

  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO tasks (lead_id, title, description, priority) VALUES (?, ?, ?, ?)`,
      [leadId, title, description, priority],
      function (err) {
        if (err) {
          console.error("❌ Task oluşturma hatası:", err.message);
          reject(err);
        } else {
          console.log(`-> 📋 Task oluşturuldu! (Task ID: ${this.lastID}, Başlık: "${title}")`);
          resolve({ taskId: this.lastID, title, priority });
        }
      }
    );
  });
}

// ─── Step 5: Send Email (Final - yeni, opsiyonel) ────────────────────────────
async function sendFollowUpEmail(toEmail, emailDraft) {
  if (!EMAIL_USER || !EMAIL_PASS) {
    console.log("⚠️ Email gönderimi için EMAIL_USER ve EMAIL_PASS gerekli. Sadece draft kaydedildi.");
    return { sent: false, reason: "Email credentials not configured." };
  }

  // Subject ve Body'yi parse et
  const lines = emailDraft.split('\n');
  const subjectLine = lines.find(l => l.startsWith('Subject:'));
  const subject = subjectLine ? subjectLine.replace('Subject:', '').trim() : 'Follow-up from The Team';
  const bodyStart = lines.findIndex(l => l.startsWith('Body:'));
  const body = bodyStart !== -1 ? lines.slice(bodyStart + 1).join('\n').trim() : emailDraft;

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: EMAIL_USER, pass: EMAIL_PASS }
  });

  try {
    await transporter.sendMail({
      from: `"The Team" <${EMAIL_USER}>`,
      to: toEmail,
      subject: subject,
      text: body
    });
    console.log(`-> ✉️  E-posta gönderildi: ${toEmail}`);
    return { sent: true, to: toEmail, subject };
  } catch (err) {
    console.error("❌ E-posta gönderim hatası:", err.message);
    return { sent: false, reason: err.message };
  }
}

// ─── HTTP Server ──────────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {

  // GET /tasks — görev listesi görüntüleme
  if (req.method === 'GET' && req.url === '/tasks') {
    db.all(`SELECT * FROM tasks ORDER BY created_at DESC`, [], (err, rows) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, tasks: rows }));
      }
    });
    return;
  }

  // GET /leads — lead listesi görüntüleme
  if (req.method === 'GET' && req.url === '/leads') {
    db.all(`SELECT id, name, email, status, intent, urgency, created_at FROM leads ORDER BY created_at DESC`, [], (err, rows) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, leads: rows }));
      }
    });
    return;
  }

  // POST /submit — ana lead pipeline
  if (req.method === 'POST' && req.url === '/submit') {
    let body = '';
    req.on('data', chunk => body += chunk.toString());

    req.on('end', async () => {
      try {
        const payload = JSON.parse(body);
        console.log("\n─── Yeni Lead Geldi ───────────────────────────────");
        console.log("Gelen Veri:", payload);

        // [1] Validation
        const validation = validatePayload(payload);
        let leadStatus = "Valid";
        let aiResult = { intent: "N/A", urgency: "N/A" };
        let emailDraft = "";
        let emailSendResult = null;
        let taskResult = null;

        if (!validation.isValid) {
          console.log("⚠️ Validation Failed:", validation.errors);
          leadStatus = "Invalid";
        } else {
          console.log("✅ Validation Passed.");

          // [2] AI Classification
          console.log("🤖 AI ile sınıflandırılıyor...");
          aiResult = await analyzeWithGemini(payload.message);
          console.log("   → Intent:", aiResult.intent, "| Urgency:", aiResult.urgency);

          // [3] AI Email Draft (Final - yeni)
          console.log("✉️  AI e-posta taslağı oluşturuluyor...");
          emailDraft = await generateFollowUpEmail(payload.name, payload.message, aiResult.intent, aiResult.urgency);
          console.log("   → Taslak oluşturuldu.");
        }

        // [4] SQLite Kayıt
        const leadId = await new Promise((resolve, reject) => {
          db.run(
            `INSERT INTO leads (name, email, message, status, intent, urgency, email_draft) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              payload.name || "N/A",
              payload.email || "N/A",
              payload.message || "N/A",
              leadStatus,
              aiResult.intent,
              aiResult.urgency,
              emailDraft
            ],
            function (err) {
              if (err) { console.error("❌ Veritabanı Kayıt Hatası:", err.message); reject(err); }
              else { console.log(`-> 💾 SQLite Leads Kaydı Başarılı! (ID: ${this.lastID})`); resolve(this.lastID); }
            }
          );
        });

        // [5] Task Oluştur (Final - yeni, valid leadler için)
        if (leadStatus === "Valid") {
          try {
            taskResult = await createTask(leadId, payload.name, aiResult.intent, aiResult.urgency);
          } catch (e) {
            console.error("Task oluşturulamadı:", e.message);
          }
        }

        // [6] E-posta Gönder (Final - yeni, valid + email draft varsa)
        if (leadStatus === "Valid" && emailDraft) {
          emailSendResult = await sendFollowUpEmail(payload.email, emailDraft);
        }

        // [7] Google Sheets / CRM Gönderimi
        if (GOOGLE_SCRIPT_URL) {
          console.log("🔵 Google Sheets'e gönderiliyor...");
          const sheetPayload = {
            contact_name: payload.name || "N/A",
            contact_email: payload.email || "N/A",
            inquiry_message: payload.message || "N/A",
            captured_at: new Date().toISOString(),
            lead_status: leadStatus,
            intent: aiResult.intent,
            urgency: aiResult.urgency,
            errors: validation.errors.join("; "),
            email_draft: emailDraft || "N/A",
            email_sent: emailSendResult ? String(emailSendResult.sent) : "false",
            task_created: taskResult ? taskResult.title : "N/A"
          };

          try {
            const sheetResponse = await fetch(GOOGLE_SCRIPT_URL, {
              method: "POST",
              headers: { "Content-Type": "text/plain" },
              body: JSON.stringify(sheetPayload)
            });
            const sheetResult = await sheetResponse.text();
            console.log("-> ✅ Google Sheets Cevabı:", sheetResult);
          } catch (sheetErr) {
            console.error("❌ Google Sheets Hatası:", sheetErr.message);
          }
        }

        // [8] Response
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          message: "Lead processed successfully.",
          lead_id: leadId,
          validation: validation,
          status: leadStatus,
          ai_analysis: aiResult,
          email_draft: emailDraft || null,
          email_sent: emailSendResult,
          task: taskResult
        }, null, 2));

      } catch (error) {
        console.error("❌ Sunucu Hatası:", error.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: "Server Error", details: error.message }));
      }
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not Found. Available: POST /submit | GET /leads | GET /tasks' }));
});

server.listen(PORT, () => {
  console.log(`\n🚀 Final Sunucusu çalışıyor! Port: ${PORT}`);
  console.log(`   POST http://localhost:${PORT}/submit  — Lead pipeline`);
  console.log(`   GET  http://localhost:${PORT}/leads   — Tüm leadler`);
  console.log(`   GET  http://localhost:${PORT}/tasks   — Tüm taskler\n`);
});
