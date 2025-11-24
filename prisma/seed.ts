import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  console.log("🌱 Memulai seeding...");

  // 1. Buat User Default (Auditor)
  // Kita pakai upsert biar gak error kalau dijalankan ulang
  const defaultUser = await prisma.user.upsert({
    where: { wallet_address: '0xGuestAuditor' },
    update: {},
    create: {
      wallet_address: '0xGuestAuditor', // Sesuai schema baru
      role: 'auditor',
      organization_name: 'Lisk Hackathon Team'
    }
  });

  console.log("✅ User seeded:", defaultUser.id);

  // 2. Buat Kategori Standar
  // Sesuai schema baru: model 'Category', field 'name'
  const categories = [
    'Meals & Entertainment', 
    'Transport & Travel', 
    'Office Supplies',
    'Software Subscription', 
    'Hardware Equipment', 
    'Utilities', 
    'Professional Services'
  ];

  for (const catName of categories) {
    await prisma.category.upsert({
      where: { name: catName },
      update: {},
      create: { 
        name: catName, 
        description: 'Standard category for audit' 
      }
    });
  }
  
  console.log("✅ Categories seeded!");
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })