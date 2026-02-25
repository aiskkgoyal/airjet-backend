// /src/controllers/beamInward.cancel.controller.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

exports.cancelInward = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });

    // We should check if any detail beams are issued/used yet.
    const details = await prisma.beamInwardDetail.findMany({
      where: { headerId: id }
    });

    // If any beam has status other than IN_STOCK, you may block cancel.
    const anyIssued = details.some(d => d.status !== 'IN_STOCK');
    if (anyIssued) {
      return res.status(400).json({ error: 'Cannot cancel inward: some beams already used/issued' });
    }

    const updatedHeader = await prisma.beamInwardHeader.update({
      where: { id },
      data: { status: 'CANCELLED' }
    });

    // Mark all details CANCELLED (soft) and keep beamNumber reserved
    await prisma.beamInwardDetail.updateMany({
      where: { headerId: id },
      data: { status: 'CANCELLED' }
    });

    res.json({ ok: true, header: updatedHeader });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};