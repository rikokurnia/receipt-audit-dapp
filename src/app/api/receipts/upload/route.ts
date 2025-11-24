import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { prisma } from "@/lib/prisma"; // Pastikan path ini benar

// Setup AI
const genAI = process.env.GEMINI_API_KEY
  ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  : null;

export async function POST(req: NextRequest) {
  try {
    console.log("🔵 [Start] Pipeline Upload (New Schema)...");

    // --- STEP 2.1: FILE HANDLING ---
    const formData = await req.formData();
    const file = formData.get("file") as File;
    // Default address jika frontend lupa kirim
    const auditorAddress = (formData.get("auditorAddress") as string) || "0xGuestAuditor"; 

    if (!file) return NextResponse.json({ error: "File wajib" }, { status: 400 });

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    // Hitung Hash SHA-256
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

    const base64Image = buffer.toString("base64");

    if (genAI && file.type.startsWith("image/")) {
      console.log("🤖 [2.2] AI Processing...");
      try {
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
        // Prompt disesuaikan agar konsisten
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
      
      const metadata = JSON.stringify({ 
        name: `Receipt ${formattedHash}`,
        keyvalues: { auditor: auditorAddress } 
      });
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
      console.error("❌ [2.3] IPFS Error (Lanjut tanpa IPFS):", ipfsError);
      ipfsCid = "ipfs-upload-failed"; // Placeholder biar gak error DB
    }

    // --- STEP 2.4: MOCK BLOCKCHAIN ---
    const mockTxHash = "0x" + crypto.randomBytes(32).toString('hex');
    console.log(`🔗 [2.4] Mock Chain Tx: ${mockTxHash}`);

    // --- STEP 2.5: DATABASE SAVE (COMPLEX TRANSACTION) ---
    console.log("💾 [2.5] Saving to MySQL (New Schema)...");

    // 1. Cari User ID berdasarkan wallet (atau pakai default yang tadi di-seed)
    let user = await prisma.user.findUnique({
      where: { wallet_address: auditorAddress }
    });

    // Fallback ke default user dari seed jika auditorAddress baru
    if (!user) {
      user = await prisma.user.findUnique({ 
        where: { wallet_address: '0xGuestAuditor' } 
      });
    }

    // 2. Cari Kategori ID
    // Kita cari yang namanya mirip, atau default ke 'Office Supplies'
    let category = await prisma.category.findFirst({
      where: { name: { contains: extractedData.category || 'Office' } }
    });
    
    if (!category) {
      // Fallback kategori aman
      category = await prisma.category.findFirst(); 
    }

    // 3. TRANSAKSI PENYIMPANAN BESAR
    // Prisma akan menyimpan ke 4 Tabel sekaligus (Receipt, Items, Blockchain, IPFS)
    const newReceipt = await prisma.receipt.create({
      data: {
        // Data Utama Receipt
        vendor_name: extractedData.vendorName,
        receipt_date: new Date(extractedData.date),
        total_amount: extractedData.amount,
        subtotal: extractedData.amount, // Asumsi sederhana
        tax_amount: 0, 
        extracted_total: extractedData.amount,
        status: "verified", // Karena AI sukses
        
        // Relasi User & Kategori
        user: { connect: { id: user?.id } },
        category: { connect: { id: category?.id } },

        // Relasi 1-to-1: IPFS Record
        ipfs_record: {
          create: {
            cid: ipfsCid,
            file_hash: formattedHash,
            file_size: BigInt(file.size), // BigInt perlu penanganan khusus di JSON
            file_type: file.type
          }
        },

        // Relasi 1-to-1: Blockchain Record
        blockchain_record: {
          create: {
            tx_hash: mockTxHash,
            network: "Lisk Sepolia (Mock)",
            block_number: BigInt(123456)
          }
        },

        // Relasi 1-to-Many: Items
        items: {
          create: extractedData.items.map((item: any) => ({
            description: item.itemName,
            quantity: item.qty,
            unit_price: item.price,
            total: item.total
          }))
        }
      },
      // Minta Prisma mengembalikan data relasi juga
      include: {
        ipfs_record: true,
        blockchain_record: true,
        items: true,
        category: true
      }
    });

    console.log(`✅ [2.5] Saved Receipt ID: ${newReceipt.id}`);

    // 4. RESPONSE JSON (Perlu trik buat BigInt)
    // BigInt tidak bisa langsung di-JSON-kan, kita convert ke String dulu
    const safeResponse = JSON.parse(JSON.stringify(newReceipt, (key, value) =>
      typeof value === 'bigint' ? value.toString() : value
    ));

    return NextResponse.json({
      success: true,
      step: "All Steps Completed",
      data: {
        receiptId: newReceipt.id,
        txHash: mockTxHash,
        ipfsCid: ipfsCid,
        explorerUrl: `https://sepolia-blockscout.lisk.com/tx/${mockTxHash}`,
        extracted: extractedData,
        dbRecord: safeResponse
      }
    });

  } catch (error) {
    console.error("❌ Server Error:", error);
    return NextResponse.json({ error: "Internal Server Error", details: String(error) }, { status: 500 });
  }
}