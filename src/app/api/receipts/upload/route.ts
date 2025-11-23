import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { GoogleGenerativeAI } from "@google/generative-ai";

// 1. Inisialisasi Gemini Client
// Menggunakan API Key dari .env
const genAI = process.env.GEMINI_API_KEY
  ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  : null;

export async function POST(req: NextRequest) {
  try {
    console.log("🔵 [Start] Pipeline Upload (Mode: Gemini AI)...");

    // --- STEP 2.1: FILE HANDLING (KITA PERTAHANKAN) ---
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const auditorAddress = formData.get("auditorAddress") as string;

    // Validasi
    if (!file) return NextResponse.json({ error: "File wajib" }, { status: 400 });

    // Convert ke Buffer & Base64 (Penting buat AI)
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64Image = buffer.toString("base64");

    // Hitung Hash (Untuk Blockchain nanti)
    const fileHash = crypto.createHash("sha256").update(buffer).digest("hex");
    const formattedHash = `0x${fileHash}`;
    console.log(`✅ [2.1] File Hash: ${formattedHash}`);

    // --- STEP 2.2: AI EXTRACTION (GEMINI FLASH) ---
    // Default value kalau AI gagal/skip
    let extractedData = {
      vendorName: "Unknown Vendor",
      amount: 0,
      date: new Date().toISOString().split('T')[0],
      category: "Uncategorized",
      items: [] 
    };

    // Cek apakah Gemini aktif & file adalah gambar
    if (genAI && file.type.startsWith("image/")) {
      console.log("🤖 [2.2] Mengirim ke Gemini AI...");

      try {
        // Pilih Model: 'gemini-1.5-flash' lebih cepat & murah untuk OCR
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

        // Prompt Rahasia untuk Struktur Data yang Konsisten
        const prompt = `
          Kamu adalah AI Auditor. Tugasmu mengekstrak data dari foto kwitansi ini.
          Kembalikan HANYA dalam format JSON murni (tanpa markdown \`\`\`json).
          Jangan ada teks pembuka/penutup.
          
          Struktur JSON wajib seperti ini:
          {
            "vendorName": "Nama Toko/Penjual",
            "amount": 10000 (Total bayar dalam angka integer, buang Rp/titik/koma),
            "date": "YYYY-MM-DD" (Jika tidak ada tahun, asumsikan 2025),
            "category": "Pilih satu: Travel, Food, Office, Utilities, Others",
            "items": [ 
              {"itemName": "Nama Barang", "qty": 1, "price": 5000, "total": 5000} 
            ]
          }
          
          Jika gambar buram atau bukan kwitansi, kembalikan JSON dengan nilai default/kosong, JANGAN ERROR.
        `;

        // Siapkan data gambar
        const imagePart = {
          inlineData: {
            data: base64Image,
            mimeType: file.type,
          },
        };

        // Tembak ke Google!
        const result = await model.generateContent([prompt, imagePart]);
        const response = await result.response;
        let text = response.text();

        // Bersihkan format Markdown jika Gemini bandel ngasih ```json
        text = text.replace(/```json/g, "").replace(/```/g, "").trim();

        // Parse JSON string jadi Object Javascript
        extractedData = JSON.parse(text);
        console.log("✨ [2.2] Gemini Sukses Baca Data:", extractedData);

      } catch (aiError) {
        console.error("⚠️ [2.2] Gemini Gagal (Lanjut pakai data default):", aiError);
        // Kita tidak throw error, supaya flow tetap jalan (Graceful Degradation)
      }
    } else {
      console.log("⏩ [2.2] Skip AI (File bukan gambar atau API Key kosong)");
    }

    // --- (NANTI STEP 2.3 IPFS & 2.4 BLOCKCHAIN DI SINI) ---

    return NextResponse.json({
      success: true,
      step: "2.2 AI Extraction Selesai",
      data: {
        fileName: file.name,
        fileHash: formattedHash,
        auditor: auditorAddress,
        extracted: extractedData // <--- INI HASIL KERJA KERAS GEMINI
      }
    });

  } catch (error) {
    console.error("❌ Server Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}