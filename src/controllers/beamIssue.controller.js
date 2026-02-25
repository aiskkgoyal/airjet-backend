// /src/controllers/beamIssue.controller.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { createBeamIssueSchema } = require('../validators/beamIssue.validator');
const { computeExpectedMetrics } = require('../utils/issueCalculations');

exports.createBeamIssue = async (req, res) => {
  try {
    const parsed = createBeamIssueSchema.parse(req.body);

    // transaction to ensure atomic state
    const result = await prisma.$transaction(async (tx) => {
      // fetch beam detail
      const beamDetail = await tx.beamInwardDetail.findUnique({
        where: { id: parsed.beamInwardDetailId }
      });
      if (!beamDetail) throw new Error('Beam not found');
      if (beamDetail.status !== 'IN_STOCK') {
        throw new Error('Beam not in IN_STOCK status; cannot issue');
      }

      // snapshot sizing values
      const sizingMeterSnapshot = beamDetail.sizingMeter;
      const sizingLtolSnapshot = beamDetail.ltolMeter;

      // greyLtol: prefer provided, else null (design level could be used if available)
      const greyLtolToUse = parsed.greyLtol ?? null;

      // compute expected metrics
      const metrics = computeExpectedMetrics({
        sizingMeter: Number(sizingMeterSnapshot),
        sizingLtol: sizingLtolSnapshot ? Number(sizingLtolSnapshot) : null,
        greyLtol: greyLtolToUse ? Number(greyLtolToUse) : null,
        rollLength: parsed.rollLength,
        widthSplitFactor: parsed.widthSplitFactor,
        expectedFabricMeterInput: parsed.expectedFabricMeter
      });

      // create beam issue row
      const issue = await tx.beamIssue.create({
        data: {
          beamInwardDetailId: parsed.beamInwardDetailId,
          loomId: parsed.loomId || null,
          designId: parsed.designId || null,
          sizingMeterSnapshot: sizingMeterSnapshot,
          sizingLtolSnapshot: sizingLtolSnapshot || null,
          greyLtolSnapshot: greyLtolToUse || null,
          expectedFabricMeter: metrics.expectedFabricMeter,
          rollLength: parsed.rollLength || null,
          widthSplitFactor: parsed.widthSplitFactor || 1,
          baseRollCount: metrics.baseRollCount || null,
          expectedRollCount: metrics.expectedRollCount || null,
          expectedTotalOutputMeter: metrics.expectedTotalOutputMeter || null,
          issueStatus: 'WAITING',
          issueDate: new Date()
        }
      });

      // update beam detail status to ISSUED
      await tx.beamInwardDetail.update({
        where: { id: parsed.beamInwardDetailId },
        data: { status: 'ISSUED' }
      });

      return { issue };
    });

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message || err.toString() });
  }
};

exports.listBeamIssues = async (req, res) => {
  try {
    const { page = 1, perPage = 20, q } = req.query;
    const skip = (Number(page) - 1) * Number(perPage);

    const where = q ? {
      OR: [
        { issueStatus: { contains: q, mode: 'insensitive' } }
      ]
    } : {};

    const [total, items] = await Promise.all([
      prisma.beamIssue.count({ where }),
      prisma.beamIssue.findMany({
        where,
        skip,
        take: Number(perPage),
        orderBy: { createdAt: 'desc' },
        include: {
          beamDetail: { include: { beamName: true } },
          loom: true,
          design: true
        }
      })
    ]);

    res.json({ total, page: Number(page), perPage: Number(perPage), items });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};