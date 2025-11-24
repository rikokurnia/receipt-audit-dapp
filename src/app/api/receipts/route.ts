import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    console.log("🔵 [API] Fetching receipts...");

    const receipts = await prisma.receipt.findMany({
      orderBy: { created_at: 'desc' },
      include: {
        category: true,
        items: true,
        blockchain_record: true,
        ipfs_record: true,
        user: {
          select: { wallet_address: true }
        }
      }
    });

    // Kita pakai 'any' di parameter map dulu biar TypeScript gak rewel
    // (Ini cara cepat hackathon, idealnya pake type definition lengkap)
    const formattedData = receipts.map((r: any) => ({
      id: r.id,
      vendor: r.vendor_name,
      date: r.receipt_date,
      total: Number(r.total_amount),
      status: r.status,
      category: r.category?.name || "Uncategorized",
      itemsCount: r.items?.length || 0,
      ipfs: {
        cid: r.ipfs_record?.cid || null,
        url: r.ipfs_record?.cid ? `https://gateway.pinata.cloud/ipfs/${r.ipfs_record.cid}` : null
      },
      blockchain: {
        txHash: r.blockchain_record?.tx_hash || null,
        explorerUrl: r.blockchain_record?.tx_hash 
          ? `https://sepolia-blockscout.lisk.com/tx/${r.blockchain_record.tx_hash}` 
          : null
      }
    }));

    return NextResponse.json({
      success: true,
      data: formattedData
    });

  } catch (error) {
    console.error("❌ [API] Fetch Error:", error);
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
  }
}