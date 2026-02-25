// /src/utils/issueCalculations.js
function safeDivide(a, b) {
  if (!b || Number(b) === 0) return null;
  return Number(a) / Number(b);
}

function ceilSafe(n) {
  if (n === null || n === undefined) return null;
  return Math.ceil(Number(n));
}

function computeExpectedMetrics({
  sizingMeter,
  sizingLtol,
  greyLtol,
  rollLength,
  widthSplitFactor = 1,
  expectedFabricMeterInput = null
}) {
  // expectedFabricMeter calculation only if not provided
  let expectedFabricMeter = expectedFabricMeterInput;
  if ((!expectedFabricMeter || Number(expectedFabricMeter) === 0) && sizingLtol && greyLtol) {
    // expectedFabricMeter = (sizingMeter / sizingLtol) * greyLtol
    const ratio = safeDivide(sizingMeter, sizingLtol);
    expectedFabricMeter = ratio !== null ? ratio * Number(greyLtol) : null;
  }

  let baseRollCount = null;
  if (expectedFabricMeter && rollLength && Number(rollLength) > 0) {
    baseRollCount = ceilSafe(Number(expectedFabricMeter) / Number(rollLength));
  }

  let expectedRollCount = null;
  if (baseRollCount !== null) {
    expectedRollCount = baseRollCount * Number(widthSplitFactor || 1);
  }

  let expectedTotalOutputMeter = null;
  if (expectedFabricMeter !== null) {
    expectedTotalOutputMeter = Number(expectedFabricMeter) * Number(widthSplitFactor || 1);
  }

  return {
    expectedFabricMeter,
    baseRollCount,
    expectedRollCount,
    expectedTotalOutputMeter
  };
}

module.exports = { computeExpectedMetrics };