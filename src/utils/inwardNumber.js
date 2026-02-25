// /src/utils/inwardNumber.js
const { getFinancialYear } = require('./financialYear');

async function generateInwardNumber(tx) {
  // tx is Prisma transaction/client passed in (e.g., tx.financialCounter)
  const fy = getFinancialYear(); // e.g. "25-26"

  // upsert the counter row for key "inward" and this fiscal year
  const counter = await tx.financialCounter.upsert({
    where: { key_fy: { key: 'inward', fy } }, // uses @@unique([key, fy], name: "key_fy")
    update: { value: { increment: 1 } },
    create: { key: 'inward', fy, value: 1 }
  });

  const running = String(counter.value).padStart(4, '0'); // 0001, 0002
  const shortYear = fy.split('-')[0]; // "25" from "25-26"

  return `BI-${shortYear}-${running}`; // e.g. "BI-26-0001" if fy "26-27"
}

module.exports = { generateInwardNumber };