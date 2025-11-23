import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { GoogleGenerativeAI } from "@google/generative-ai";

// Setup AI
const genAI = process.env.GEMINI_API_KEY
  ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  : null;

export async function POST(req: NextRequest) {
  try {
    console.log("🔵 [Start] Pipeline Upload...");

    // --- STEP 2.1: FILE HANDLING ---
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const auditorAddress = formData.get("auditorAddress") as string;

    if (!file) return NextResponse.json({ error: "File wajib" }, { status: 400 });

    // Convert ke Buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    // Hitung Hash
    const fileHash = crypto.createHash("sha256").update(buffer).digest("hex");
    const formattedHash = `0x${fileHash}`;
    console.log(`✅ [2.1] Hash: ${formattedHash}`);

    // --- STEP 2.2: AI EXTRACTION ---
    let extractedData = {
      vendorName: "Unknown Vendor",
      amount: 0,
      date: new Date().toISOString().split('T')[0],
      category: "Uncategorized",
      items: []
    };

    // Convert Buffer ke Base64 untuk AI
    const base64Image = buffer.toString("base64");

    if (genAI && file.type.startsWith("image/")) {
      console.log("🤖 [2.2] AI Processing...");
      try {
        // Pakai model Flash terbaru Anda
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        
        const prompt = `Extract receipt data to JSON only: { "vendorName": string, "amount": number, "date": "YYYY-MM-DD", "category": string, "items": [{ "itemName": string, "qty": number, "price": number, "total": number }] }. No markdown.`;
        
        const imagePart = { inlineData: { data: base64Image, mimeType: file.type } };
        
        const result = await model.generateContent([prompt, imagePart]);
        let text = result.response.text().replace(/```json|```/g, "").trim();
        
        extractedData = JSON.parse(text);
        console.log("✨ [2.2] AI Success");
      } catch (e) {
        console.error("⚠️ [2.2] AI Failed (Fallback Manual)");
      }
    }

    // --- STEP 2.3: IPFS UPLOAD (PINATA) ---
    console.log("☁️ [2.3] Uploading to IPFS (Pinata)...");
    let ipfsCid = "";
    
    try {
      // Siapkan FormData khusus untuk Pinata
      const pinataData = new FormData();
      
      // Kita harus bungkus buffer jadi Blob agar Pinata mau terima
      const fileBlob = new Blob([buffer], { type: file.type });
      pinataData.append("file", fileBlob, file.name);

      // Tambah Metadata (Opsional tapi bagus buat dashboard Pinata)
      const metadata = JSON.stringify({
        name: `Receipt ${formattedHash}`,
        keyvalues: {
          auditor: auditorAddress,
          vendor: extractedData.vendorName
        }
      });
      pinataData.append("pinataMetadata", metadata);
      pinataData.append("pinataOptions", JSON.stringify({ cidVersion: 1 }));

      // Tembak API Pinata
      const pinataRes = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.PINATA_JWT}`, // Ambil dari .env
        },
        body: pinataData,
      });

      if (!pinataRes.ok) {
        throw new Error(`Pinata Error: ${pinataRes.statusText}`);
      }

      const pinataJson = await pinataRes.json();
      ipfsCid = pinataJson.IpfsHash; // INI DIA CID-NYA!
      console.log(`📌 [2.3] IPFS CID: ${ipfsCid}`);

    } catch (ipfsError) {
      console.error("❌ [2.3] IPFS Failed:", ipfsError);
      // Kita throw error 500 karena IPFS itu wajib buat audit trail
      return NextResponse.json({ error: "Gagal Upload ke IPFS" }, { status: 500 });
    }

    // --- (NANTI STEP 2.4 BLOCKCHAIN DI SINI) ---

    return NextResponse.json({
      success: true,
      step: "2.3 IPFS Selesai",
      data: {
        fileName: file.name,
        fileHash: formattedHash,
        auditor: auditorAddress,
        extracted: extractedData,
        // Hasil baru Step 2.3:
        ipfsCid: ipfsCid, 
        ipfsUrl: `https://${process.env.PINATA_GATEWAY}/ipfs/${ipfsCid}`
      }
    });

  } catch (error) {
    console.error("❌ Server Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}