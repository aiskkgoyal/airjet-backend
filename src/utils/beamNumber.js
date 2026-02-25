function getFinancialYear() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  if (month >= 4) {
    return `${year % 100}-${(year + 1) % 100}`;
  } else {
    return `${(year - 1) % 100}-${year % 100}`;
  }
}

async function generateBeamNumber(tx) {
  const fy = getFinancialYear();

  const counter = await tx.financialCounter.upsert({
    where: { key_fy: { key: "beam", fy } },
    update: { value: { increment: 1 } },
    create: { key: "beam", fy, value: 1 }
  });

  const running = String(counter.value).padStart(4, "0");
  const shortYear = fy.split("-")[0];

  return `B-${shortYear}-${running}`;
}

module.exports = { generateBeamNumber };