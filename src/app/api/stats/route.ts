import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = 'force-dynamic'; // Selalu refresh data (Realtime)

export async function GET() {
  try {
    console.log("🔵 [API Stats] Calculating dashboard metrics...");

    // 1. AMBIL SEMUA DATA YANG DIPERLUKAN
    // Kita ambil field yang butuh dihitung saja biar ringan
    const receipts = await prisma.receipt.findMany({
      select: {
        id: true,
        total_amount: true,
        status: true,
        receipt_date: true,
        category: {
          select: { name: true }
        }
      }
    });

    // 2. INISIALISASI VARIABEL HITUNGAN
    let totalVerifiedSpend = 0;
    let verifiedCount = 0;
    let pendingCount = 0;
    let failedCount = 0;
    
    // Struktur untuk Grafik
    const categoryMap: Record<string, number> = {};
    const monthlyMap: Record<string, number> = {};

    // 3. LOOPING SINGLE PASS (O(n)) - Efisien!
    receipts.forEach((r) => {
      const amount = Number(r.total_amount); // Decimal ke Number
      const status = r.status.toLowerCase();
      
      // A. Hitung Kartu Atas
      if (status === 'verified') {
        totalVerifiedSpend += amount;
        verifiedCount++;
      } else if (status === 'pending') {
        pendingCount++;
      } else if (status === 'failed') {
        failedCount++;
      }

      // B. Hitung Grafik Kategori (Spending Distribution)
      const catName = r.category?.name || "Uncategorized";
      if (!categoryMap[catName]) categoryMap[catName] = 0;
      categoryMap[catName] += amount;

      // C. Hitung Grafik Tren (Monthly)
      // Format: "Jan", "Feb", "Mar"
      const month = new Date(r.receipt_date).toLocaleString('default', { month: 'short' });
      if (!monthlyMap[month]) monthlyMap[month] = 0;
      monthlyMap[month] += amount;
    });

    // 4. HITUNG PERSENTASE (Compliance)
    const totalReceipts = receipts.length;
    const complianceRate = totalReceipts > 0 
      ? ((verifiedCount / totalReceipts) * 100).toFixed(1) 
      : 0;

    // 5. FORMAT DATA UNTUK GRAFIK FRONTEND
    // Ubah Map jadi Array: [{ name: 'Travel', value: 500000 }, ...]
    const categoryDistribution = Object.keys(categoryMap).map(key => ({
      name: key,
      value: categoryMap[key]
    })).sort((a, b) => b.value - a.value); // Urutkan dari terbesar

    // Urutkan Bulan secara Kronologis (Hackathon way: hardcode urutan bulan)
    const monthsOrder = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const sixMonthTrend = Object.keys(monthlyMap)
      .sort((a, b) => monthsOrder.indexOf(a) - monthsOrder.indexOf(b))
      .map(key => ({
        name: key,
        amount: monthlyMap[key]
      }));

    // 6. KIRIM JSON FINAL
    const responseData = {
      summary: {
        totalVerifiedSpend,
        totalReceipts,
        verifiedCount,
        pendingCount,
        complianceRate: Number(complianceRate)
      },
      charts: {
        spendingByCategory: categoryDistribution,
        monthlyTrend: sixMonthTrend
      }
    };

    console.log("✅ [API Stats] Calculation done.");
    return NextResponse.json({
      success: true,
      data: responseData
    });

  } catch (error) {
    console.error("❌ [API Stats] Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}