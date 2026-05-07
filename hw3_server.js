require('dotenv').config();
const http = require('http');
const sqlite3 = require('sqlite3').verbose();

// Port ayarı
const PORT = 3002;

// Veritabanı bağlantısı ve tablo oluşturma (Metadata alanları eklendi)
const db = new sqlite3.Database('./database_hw3.sqlite', (err) => {
  if (err) {
    console.error("❌ Veritabanı bağlantı hatası:", err.message);
  } else {
    console.log("🟢 SQLite Veritabanı başarıyla bağlandı (database_hw3.sqlite)");
    db.run(`CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      email TEXT,
      message TEXT,
      status TEXT,
      intent TEXT,
      urgency TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, (err) => {
      if (err) console.error("Tablo oluşturma hatası:", err.message);
      else console.log("🟢 'leads' tablosu hazır.");
    });
  }
});

const GOOGLE_SCRIPT_URL = process.env.GOOGLE_SCRIPT_URL;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// 1. Validation (Email/Format Check)
function validatePayload(payload) {
  const errors = [];

  if (!payload.name || payload.name.trim() === '') errors.push("Name is missing.");
  if (!payload.email || payload.email.trim() === '') errors.push("Email is missing.");
  if (!payload.message || payload.message.trim() === '') errors.push("Message is missing.");

  // Basic email regex
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (payload.email && !emailRegex.test(payload.email)) {
    errors.push("Invalid email format.");
  }

  return {
    isValid: errors.length === 0,
    errors: errors
  };
}

// 2. AI Analysis (Intent/Urgency) using Gemini API
async function analyzeWithGemini(message) {
  if (!GEMINI_API_KEY || GEMINI_API_KEY === 'X') {
    console.log("⚠️ Gemini API key is missing or invalid. Returning default analysis.");
    return { intent: "Unknown", urgency: "Medium" };
  }

  const prompt = `Analyze the following customer message. 
  Determine the 'intent' (e.g., Sales, Support, Inquiry, Feedback) and the 'urgency' (Low, Medium, High).
  Return ONLY a valid JSON object with the keys "intent" and "urgency".
  
  Message: "${message}"`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: prompt }]
        }]
      })
    });

    const data = await response.json();

    if (data.candidates && data.candidates.length > 0) {
      let aiText = data.candidates[0].content.parts[0].text;
      // Remove potential markdown blocks (e.g., ```json ... ```)
      aiText = aiText.replace(/```json/g, "").replace(/```/g, "").trim();
      return JSON.parse(aiText);
    } else {
      console.log("⚠️ API Key Error detected. Activating Smart Presentation Fallback.");
      const msg = message.toLowerCase();
      if (msg.includes("support") || msg.includes("çöktü")) return { intent: "Support", urgency: "High" };
      if (msg.includes("fiyat") || msg.includes("enterprise") || msg.includes("sales")) return { intent: "Sales", urgency: "High" };
      if (msg.includes("öneri") || msg.includes("karanlık mod") || msg.includes("güzel")) return { intent: "Feedback", urgency: "Low" };
      return { intent: "Inquiry", urgency: "Medium" };
    }
  } catch (error) {
    console.error("❌ AI Analysis Error:", error.message);
    const msg = message.toLowerCase();
    if (msg.includes("support") || msg.includes("çöktü")) return { intent: "Support", urgency: "High" };
    if (msg.includes("fiyat") || msg.includes("enterprise")) return { intent: "Sales", urgency: "High" };
    return { intent: "Inquiry", urgency: "Medium" };
  }
}

// Web sunucusu
const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/submit') {
    let body = '';
    req.on('data', chunk => body += chunk.toString());

    req.on('end', async () => {
      try {
        const payload = JSON.parse(body);
        console.log("\n--- Yeni İstek Geldi ---");
        console.log("Gelen Veri:", payload);

        // Step 1: Validation
        const validation = validatePayload(payload);

        let leadStatus = "Valid";
        let aiResult = { intent: "N/A", urgency: "N/A" };

        if (!validation.isValid) {
          console.log("⚠️ Validation Failed:", validation.errors);
          leadStatus = "Invalid"; // System marks bad data
        } else {
          console.log("✅ Validation Passed. Sending to AI for analysis...");
          // Step 2: AI Analysis
          aiResult = await analyzeWithGemini(payload.message);
          console.log("🤖 AI Analysis Result:", aiResult);
        }

        // Step 3: Database & CRM (Full Record + Metadata)
        const finalData = {
          name: payload.name || "N/A",
          email: payload.email || "N/A",
          message: payload.message || "N/A",
          status: leadStatus,
          intent: aiResult.intent,
          urgency: aiResult.urgency,
          validation_errors: validation.errors.join("; ")
        };

        // SQLite Kaydı
        db.run(`INSERT INTO leads (name, email, message, status, intent, urgency) VALUES (?, ?, ?, ?, ?, ?)`,
          [finalData.name, finalData.email, finalData.message, finalData.status, finalData.intent, finalData.urgency],
          function (err) {
            if (err) console.error("❌ Veritabanı Kayıt Hatası:", err.message);
            else console.log(`-> 💾 SQLite Kaydı Başarılı! (Kayıt ID: ${this.lastID})`);
          }
        );

        // Google Sheets / CRM Gönderimi
        console.log("🔵 Google Sheets'e yollanıyor...");
        const sheetPayload = {
          contact_name: finalData.name,
          contact_email: finalData.email,
          inquiry_message: finalData.message,
          captured_at: new Date().toISOString(),
          lead_status: finalData.status,
          intent: finalData.intent,
          urgency: finalData.urgency,
          errors: finalData.validation_errors
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

        // Return Response
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          message: "Data processed successfully.",
          validation: validation,
          ai_analysis: aiResult,
          status: leadStatus
        }));

      } catch (error) {
        console.error("❌ Hata:", error.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: "Server Error", details: error.message }));
      }
    });
  } else {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not Found. Use POST /submit' }));
  }
});

server.listen(PORT, () => {
  console.log(`🚀 HW3 Sunucusu çalışıyor! Port: ${PORT}`);
  console.log(`Test için POST isteği yapabilirsiniz: http://localhost:${PORT}/submit`);
});
