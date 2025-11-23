import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

export async function POST(req: NextRequest) {
  try {
    console.log("🔵 [Start] Pipeline Upload Kwitansi...");

    // 1. TERIMA DATA DARI FRONTEND
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const auditorAddress = formData.get("auditorAddress") as string;

    // Validasi input
    if (!file) {
      return NextResponse.json(
        { error: "File wajib diupload" },
        { status: 400 }
      );
    }

    // 2. PROSES FILE (Step 2.1 File Handling)
    // Convert ke Buffer biar bisa dihitung hash-nya
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 3. HITUNG HASH SHA-256 (Sidik Jari Digital)
    const fileHash = crypto.createHash("sha256").update(buffer).digest("hex");
    const formattedHash = `0x${fileHash}`; 

    console.log(`✅ [Step 2.1] File diterima: ${file.name}`);
    console.log(`🔐 [Step 2.1] Hash: ${formattedHash}`);

    // --- (NANTI STEP AI & IPFS DI SINI) ---

    // 4. RETURN RESPONSE (Sementara)
    return NextResponse.json({
      success: true,
      message: "File handling sukses",
      data: {
        fileName: file.name,
        fileSize: file.size,
        fileHash: formattedHash, // Hash ini yang nanti masuk Blockchain
        auditor: auditorAddress || "Unknown"
      }
    });

  } catch (error) {
    console.error("❌ Error Upload:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}