// /src/utils/receive.utils.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Get next main piece number (atomic)
async function getNextMainPieceNumber(tx) {
  // tx is optional; if not provided use prisma
  const client = tx || prisma;
  // we expect a Counter row with key='main_piece' already created in seed
  const updated = await client.counter.update({
    where: { key: 'main_piece' },
    data: { value: { increment: 1 } }
  });
  return updated.value;
}

// marks processing
function computeMarksStats(marks, pieceMeter, beamLtolSnapshot) {
  // marks expected as array of positions in meters, monotonic increasing
  if (!marks || marks.length < 2) {
    return { intervals: [], avgInterval: null, deltaLtol: null, valid: true };
  }

  // basic validations done elsewhere; compute intervals
  const intervals = [];
  for (let i = 1; i < marks.length; i++) {
    intervals.push(Number((marks[i] - marks[i - 1]).toFixed(4)));
  }
  const sum = intervals.reduce((a, b) => a + b, 0);
  const avgInterval = intervals.length ? Number((sum / intervals.length).toFixed(4)) : null;
  const deltaLtol = (avgInterval !== null && beamLtolSnapshot != null) ? Number((avgInterval - Number(beamLtolSnapshot)).toFixed(4)) : null;

  return { intervals, avgInterval, deltaLtol, valid: true };
}

module.exports = {
  getNextMainPieceNumber,
  computeMarksStats
};