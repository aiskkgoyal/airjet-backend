// /src/controllers/beamIssue.actions.controller.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Start (approve) an issue: WAITING -> RUNNING
 * Requirements:
 * - Issue must be in WAITING
 * - If loomId provided, ensure no other RUNNING issue exists on same loom
 */
exports.startIssue = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });

    const result = await prisma.$transaction(async (tx) => {
      const issue = await tx.beamIssue.findUnique({ where: { id }});
      if (!issue) throw new Error('Issue not found');
      if (issue.issueStatus !== 'WAITING') throw new Error('Only WAITING issues can be started');

      if (issue.loomId) {
        // check other running on same loom
        const other = await tx.beamIssue.findFirst({
          where: { loomId: issue.loomId, issueStatus: 'RUNNING' }
        });
        if (other) throw new Error('Another RUNNING beam exists on this loom');
      }

      const update = await tx.beamIssue.update({
        where: { id },
        data: { issueStatus: 'RUNNING', startDate: new Date() }
      });

      // Also mark beamDetail as ISSUED / RUNNING? Keep beamDetail status as ISSUED (we use issue table for runtime)
      return update;
    });

    res.json({ ok: true, result });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message });
  }
};

/**
 * Interrupt a running issue: RUNNING -> INTERRUPTED
 * - Set endDate, issueStatus
 * - Set related beam detail status back to IN_STOCK (so it can be re-issued later)
 */
exports.interruptIssue = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });

    const result = await prisma.$transaction(async (tx) => {
      const issue = await tx.beamIssue.findUnique({ where: { id }});
      if (!issue) throw new Error('Issue not found');
      if (issue.issueStatus !== 'RUNNING') throw new Error('Only RUNNING issues can be interrupted');

      const updated = await tx.beamIssue.update({
        where: { id },
        data: { issueStatus: 'INTERRUPTED', endDate: new Date() }
      });

      // Set beamDetail status back to IN_STOCK so it can be re-issued
      await tx.beamInwardDetail.update({
        where: { id: issue.beamInwardDetailId },
        data: { status: 'IN_STOCK' }
      });

      return updated;
    });

    res.json({ ok: true, result });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message });
  }
};

/**
 * Complete an issue: RUNNING -> COMPLETED
 * Usually called when beam fully consumed, but in our flow this may be driven by receive logic.
 * We'll allow admin to mark completed (soft behavior)
 */
exports.completeIssue = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });

    const result = await prisma.$transaction(async (tx) => {
      const issue = await tx.beamIssue.findUnique({ where: { id }});
      if (!issue) throw new Error('Issue not found');
      if (issue.issueStatus === 'COMPLETED') throw new Error('Already completed');

      const updated = await tx.beamIssue.update({
        where: { id },
        data: { issueStatus: 'COMPLETED', endDate: new Date() }
      });

      // Also mark beamDetail CLOSED if its remainingMeter is 0 (but we won't change remaining here)
      // fetch beam detail
      const beamDetail = await tx.beamInwardDetail.findUnique({ where: { id: issue.beamInwardDetailId }});
      if (beamDetail && Number(beamDetail.remainingMeter) <= 0) {
        await tx.beamInwardDetail.update({
          where: { id: issue.beamInwardDetailId },
          data: { status: 'CLOSED' }
        });
      }

      return updated;
    });

    res.json({ ok: true, result });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message });
  }
};