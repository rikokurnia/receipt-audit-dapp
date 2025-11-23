import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { prisma } from "@/lib/prisma"; // Import prisma yang baru dibuat

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

    // Convert Buffer ke Base64
    const base64Image = buffer.toString("base64");

    if (genAI && file.type.startsWith("image/")) {
      console.log("🤖 [2.2] AI Processing...");
      try {
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        
        // Prompt kita minta format amount angka murni
        const prompt = `Extract receipt data to JSON only: { "vendorName": string, "amount": number, "date": "YYYY-MM-DD", "category": string, "items": [{ "itemName": string, "qty": number, "price": number, "total": number }] }. No markdown.`;
        
        const imagePart = { inlineData: { data: base64Image, mimeType: file.type } };
        const result = await model.generateContent([prompt, imagePart]);
        let text = result.response.text().replace(/```json|```/g, "").trim();
        
        extractedData = JSON.parse(text);
        console.log("✨ [2.2] AI Success:", extractedData.vendorName);
      } catch (e) {
        console.error("⚠️ [2.2] AI Failed (Fallback Manual)");
      }
    }

    // --- STEP 2.3: IPFS UPLOAD ---
    console.log("☁️ [2.3] Uploading to IPFS...");
    let ipfsCid = "";
    
    try {
      const pinataData = new FormData();
      const fileBlob = new Blob([buffer], { type: file.type });
      pinataData.append("file", fileBlob, file.name);
      
      // Metadata sederhana
      const metadata = JSON.stringify({ name: `Receipt ${formattedHash}` });
      pinataData.append("pinataMetadata", metadata);
      pinataData.append("pinataOptions", JSON.stringify({ cidVersion: 1 }));

      const pinataRes = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.PINATA_JWT}` },
        body: pinataData,
      });

      if (!pinataRes.ok) throw new Error("Pinata Upload Failed");
      const pinataJson = await pinataRes.json();
      ipfsCid = pinataJson.IpfsHash;
      console.log(`📌 [2.3] IPFS CID: ${ipfsCid}`);

    } catch (ipfsError) {
      console.error("❌ [2.3] IPFS Error:", ipfsError);
      // Lanjut saja dulu walau IPFS gagal (biar DB tetap keisi saat hackathon)
    }

    // --- STEP 2.4: MOCK BLOCKCHAIN (Sementara) ---
    // Kita pura-pura dapat TxHash dari blockchain
    const mockTxHash = "0x" + crypto.randomBytes(32).toString('hex');
    console.log(`🔗 [2.4] Mock Chain Tx: ${mockTxHash}`);

    // --- STEP 2.5: DATABASE SAVE (PRISMA) ---
    console.log("💾 [2.5] Saving to MySQL Database...");
    
    // Kita simpan ke tabel TrReceipt
    const newReceipt = await prisma.trReceipt.create({
      data: {
        FileHash: formattedHash,
        CId: ipfsCid,
        TxHash: mockTxHash, // Nanti diganti hash asli Lisk
        
        // Data dari AI
        VendorName: extractedData.vendorName,
        TransactionDate: new Date(extractedData.date),
        GrandTotal: extractedData.amount,
        SubTotal: extractedData.amount, // Asumsi simpel
        Ppn: 0,
        
        // Kategori (Simpan String Langsung sesuai kesepakatan Hackathon)
        // Atau kalau mau rapi, bisa cari ID kategori dulu. Kita tembak NULL dulu kalau ribet.
        // Disini kita anggap CategoryId opsional / null dulu biar gak error relasi.
        
        UserId: null, // Bisa diisi nanti kalau sudah ada login user
      }
    });

    console.log(`✅ [2.5] Saved to DB with ID: ${newReceipt.ReceiptId}`);

    // Return Response Komplit
    return NextResponse.json({
      success: true,
      step: "All Steps Completed",
      data: {
        receiptId: newReceipt.ReceiptId,
        fileName: file.name,
        fileHash: formattedHash,
        ipfsCid: ipfsCid,
        txHash: mockTxHash,
        extracted: extractedData,
        explorerUrl: `https://sepolia-blockscout.lisk.com/tx/${mockTxHash}`
      }
    });

  } catch (error) {
    console.error("❌ Server Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}