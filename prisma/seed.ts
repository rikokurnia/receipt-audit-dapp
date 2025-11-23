// prisma/seed.ts
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  // Isi Kategori Standar
  await prisma.msCategory.createMany({
    data: [
      { CategoryName: 'Travel & Transport' },
      { CategoryName: 'Food & Beverage' },
      { CategoryName: 'Office Supplies' },
      { CategoryName: 'Accommodation' },
    ],
  })
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