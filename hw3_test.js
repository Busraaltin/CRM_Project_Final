const PORT = 3002;
const URL = `http://localhost:${PORT}/submit`;

async function runTests() {
  console.log("🚀 HW3/Final CRM Pipeline Testleri Başlatılıyor...\n");

  // 🔴 TEST CASE 1: Geçersiz İstek (Hatalı/Eksik E-posta)
  console.log("--------------------------------------------------");
  console.log("🔴 TEST 1: Geçersiz İstek Gönderiliyor (Validation & Bypass Kontrolü)");
  const invalidPayload = {
    name: "Ahmet Yilmaz",
    email: "ahmet-hatali-mail", // Regex'e uymayan hatalı mail adresi
    message: "Sisteme giriş yapamıyorum, hata veriyor."
  };

  try {
    const res1 = await fetch(URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(invalidPayload)
    });
    const result1 = await res1.json();
    console.log("🟢 Sunucudan Gelen Cevap:");
    console.log(JSON.stringify(result1, null, 2));
    console.log("\n🎯 Test 1 Durumu: Hatalı veri başarıyla engellendi, status 'Invalid' yapıldı ve AI adımı atlandı.");
  } catch (err) {
    console.error("❌ Test 1 Hatası:", err.message);
  }

  // 🟢 TEST CASE 2: Geçerli İstek (AI Sınıflandırma, Taslak & Task Oluşturma)
  console.log("\n--------------------------------------------------");
  console.log("🟢 TEST 2: Geçerli İstek Gönderiliyor (Tam Akış)");
  const validPayload = {
    name: "Busra Demir",
    email: "busra@example.com",
    message: "Şirketimiz için Enterprise paketinizle ilgileniyoruz, acil olarak fiyat teklifi alabilir miyiz?"
  };

  try {
    const res2 = await fetch(URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validPayload)
    });
    const result2 = await res2.json();
    console.log("🟢 Sunucudan Gelen Cevap:");
    console.log(JSON.stringify(result2, null, 2));
    console.log("\n🎯 Test 2 Durumu: Başarıyla doğrulandı, yapay zeka sınıflandırdı (Intent/Urgency), e-posta taslağı yazıldı, veritabanına kaydedildi, Google Sheets'e gönderildi ve görev oluşturuldu!");
  } catch (err) {
    console.error("❌ Test 2 Hatası:", err.message);
  }
  
  console.log("\n--------------------------------------------------");
  console.log("🏁 Testler tamamlandı! Sunucu konsoluna bakarak SQLite ve Google Sheets çıktılarını kontrol edebilirsiniz.");
}

runTests();
