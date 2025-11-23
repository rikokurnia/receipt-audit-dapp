// check-models.js
require('dotenv').config();

async function checkAvailableModels() {
  const apiKey = process.env.GEMINI_API_KEY;
  
  if (!apiKey) {
    console.error("❌ Error: GEMINI_API_KEY tidak ditemukan di file .env");
    return;
  }

  console.log("🔍 Sedang mengecek ke server Google...");
  
  // Kita tembak langsung endpoint API Google (bukan via SDK biar lebih transparan)
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    if (data.error) {
      console.error("❌ API Error:", data.error.message);
      return;
    }

    console.log("\n✅ DAFTAR MODEL YANG TERSEDIA UNTUK ANDA:");
    console.log("========================================");
    
    // Filter hanya model 'generateContent' (yang bisa baca gambar/teks)
    const visionModels = data.models.filter(m => 
      m.supportedGenerationMethods.includes("generateContent") &&
      m.name.includes("gemini")
    );

    visionModels.forEach(model => {
      // Bersihkan nama (hapus 'models/')
      const cleanName = model.name.replace("models/", "");
      console.log(`🔹 ${cleanName}`);
    });

    console.log("\n👉 Saran: Gunakan salah satu nama di atas di file 'route.ts' Anda.");

  } catch (error) {
    console.error("❌ Gagal koneksi:", error);
  }
}

checkAvailableModels();