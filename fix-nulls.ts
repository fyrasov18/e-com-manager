import { prisma } from './src/lib/prisma'

async function main() {
  await prisma.$executeRaw`UPDATE "Order" SET "deliveryCostApplied" = 0 WHERE "deliveryCostApplied" IS NULL`;
  await prisma.$executeRaw`UPDATE "Order" SET "returnCostApplied" = 0 WHERE "returnCostApplied" IS NULL`;
  console.log('Fixed nulls')
}
main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect())
