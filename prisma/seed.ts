import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  const products = [
    { code: "SP-001", name: "即食饭团", spec: "120g*24", unit: "个", category: "冷藏鲜食", shelfLifeDays: 3, minStock: 20 },
    { code: "SP-002", name: "三明治", spec: "180g*18", unit: "个", category: "冷藏鲜食", shelfLifeDays: 4, minStock: 15 },
    { code: "SP-003", name: "常温蛋糕", spec: "60g*48", unit: "包", category: "烘焙", shelfLifeDays: 90, minStock: 30 },
  ];

  for (const product of products) {
    await prisma.product.upsert({
      where: { code: product.code },
      update: product,
      create: product,
    });
  }

  for (const customer of [
    { code: "KH-001", name: "喜市多", paymentNote: "月结，按客户对账单为准" },
    { code: "KH-002", name: "全家", paymentNote: "月结，需保留出库明细" },
    { code: "KH-003", name: "美宜家", paymentNote: "按合同账期结算" },
  ]) {
    await prisma.customer.upsert({
      where: { code: customer.code },
      update: customer,
      create: customer,
    });
  }

  await prisma.supplier.upsert({
    where: { code: "GYS-001" },
    update: { name: "默认食品供应商", contact: "采购联系人" },
    create: { code: "GYS-001", name: "默认食品供应商", contact: "采购联系人" },
  });
}

main().finally(async () => {
  await prisma.$disconnect();
});
