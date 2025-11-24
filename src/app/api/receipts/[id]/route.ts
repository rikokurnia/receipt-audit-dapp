import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  // PERUBAHAN PENTING DI SINI: Tipe params adalah Promise
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // 1. AWAIT PARAMS DULU (WAJIB DI NEXT.JS 15+)
    const { id } = await params;
    const receiptId = id;

    console.log(`🔵 [API Detail] Fetching: ${receiptId}`);

    // 2. Cek Database
    const receiptData = await prisma.receipt.findUnique({
      where: { id: receiptId },
      include: {
        category: true,
        items: true,
        blockchain_record: true,
        ipfs_record: true,
        user: { select: { wallet_address: true } }
      }
    });

    if (!receiptData) {
      return NextResponse.json({ error: "Receipt not found" }, { status: 404 });
    }

    // Bypass TS
    const receipt: any = receiptData;

    // 3. Format Data
    const formattedData = {
      id: receipt.id,
      vendor: receipt.vendor_name || "Unknown Vendor",
      date: receipt.receipt_date,
      invoiceNumber: receipt.invoice_number || "-",
      total: Number(receipt.total_amount) || 0,
      subtotal: Number(receipt.subtotal) || 0,
      tax: Number(receipt.tax_amount) || 0,
      status: receipt.status || "pending",
      category: receipt.category?.name || "Uncategorized",
      auditor: receipt.user?.name || receipt.user?.wallet_address || "Unknown",
      confidenceScore: receipt.ai_confidence_score || 0,
      
      items: receipt.items?.map((item: any) => ({
        id: item.id,
        description: item.description || "Item",
        qty: item.quantity || 1,
        price: Number(item.unit_price) || 0,
        total: Number(item.total) || 0
      })) || [],
      
      ipfs: {
        cid: receipt.ipfs_record?.cid || null,
        url: receipt.ipfs_record?.cid ? `https://gateway.pinata.cloud/ipfs/${receipt.ipfs_record.cid}` : null,
        fileHash: receipt.ipfs_record?.file_hash || null
      },
      
      blockchain: {
        txHash: receipt.blockchain_record?.tx_hash || null,
        block: receipt.blockchain_record?.block_number?.toString() || "Pending",
        explorerUrl: receipt.blockchain_record?.tx_hash 
          ? `https://sepolia-blockscout.lisk.com/tx/${receipt.blockchain_record.tx_hash}` 
          : null
      }
    };

    return NextResponse.json({
      success: true,
      data: formattedData
    });

  } catch (error) {
    console.error("❌ [API Detail] Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}