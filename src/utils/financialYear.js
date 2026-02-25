// /src/utils/financialYear.js
function getFinancialYear() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1; // JS months 0-11

  if (month >= 4) {
    // Apr-Dec => FY starts current year
    return `${year % 100}-${(year + 1) % 100}`; // e.g., "26-27"
  } else {
    // Jan-Mar => FY started previous year
    return `${(year - 1) % 100}-${year % 100}`; // e.g., "25-26"
  }
}

module.exports = { getFinancialYear };