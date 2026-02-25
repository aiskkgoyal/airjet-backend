// /src/controllers/receive.controller.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { createHeaderSchema, addPieceSchema } = require('../validators/receive.validator');
const { getNextMainPieceNumber, computeMarksStats } = require('../utils/receive.utils');

// env tolerance percent (e.g., 2 means 2%)
const TOLERANCE_PERCENT = Number(process.env.OVERPRODUCTION_TOLERANCE_PERCENT || 2);

async function createReceiveHeader(req, res) {
  try {
    const parsed = createHeaderSchema.parse(req.body);

    // fetch beam and beamIssue snapshot info
    const beamDetail = await prisma.beamInwardDetail.findUnique({
      where: { id: parsed.beamInwardDetailId }
    });
    if (!beamDetail) return res.status(404).json({ error: 'Beam not found' });

    // try to fetch beamIssue snapshot if provided
    let beamIssue = null;
    if (parsed.beamIssueId) {
      beamIssue = await prisma.beamIssue.findUnique({ where: { id: parsed.beamIssueId } });
    }

    // choose beam_ltol_snapshot: prefer issue snapshot, else beam detail ltol
    const beamLtolSnapshot = beamIssue?.sizingLtolSnapshot ?? beamDetail.ltolMeter ?? null;

    const header = await prisma.receiveHeader.create({
      data: {
        receiveNo: `GR-${Date.now()}`, // simple temporary; we'll not rely on FI reset for this; can change later
        receiveDate: new Date(),
        beamIssueId: parsed.beamIssueId ?? null,
        beamInwardDetailId: parsed.beamInwardDetailId,
        designId: parsed.designId,
        loomId: parsed.loomId ?? null,
        beamLtolSnapshot: beamLtolSnapshot,
        status: 'DRAFT',
        createdById: req.user?.id ?? null
      }
    });

    res.json({ ok: true, header });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message || err.toString() });
  }
}

async function addPieceRow(req, res) {
  try {
    const headerId = Number(req.params.id);
    if (!headerId) return res.status(400).json({ error: 'Invalid header id' });

    const parsed = addPieceSchema.parse(req.body);

    // basic validations:
    if (parsed.damagedMeter > parsed.meter) {
      return res.status(400).json({ error: 'Damaged meter cannot exceed meter' });
    }

    // ensure header exists and is DRAFT
    const header = await prisma.receiveHeader.findUnique({ where: { id: headerId }});
    if (!header) return res.status(404).json({ error: 'Receive header not found' });
    if (header.status !== 'DRAFT') return res.status(400).json({ error: 'Cannot add piece to non-draft header' });

    // marks validations: strictly increasing and <= meter
    const marks = parsed.marks || [];
    for (let i = 0; i < marks.length; i++) {
      const m = marks[i];
      if (m < 0 || m > parsed.meter) return res.status(400).json({ error: `Mark ${m} out of range for piece meter ${parsed.meter}` });
      if (i > 0 && marks[i] <= marks[i - 1]) return res.status(400).json({ error: 'Marks must be strictly increasing' });
    }

    // pieceLabel formation
    const pieceLabel = parsed.partSuffix ? `${parsed.mainPieceNo}${parsed.partSuffix}` : `${parsed.mainPieceNo}`;

    // compute net
    const netMeter = Number((parsed.meter - (parsed.damagedMeter || 0)).toFixed(4));
    const netWeight = parsed.weight ? Number((parsed.weight - (parsed.damagedWeight || 0)).toFixed(4)) : null;

    // compute marks stats using header beamLtolSnapshot
    const stats = computeMarksStats(marks, parsed.meter, header.beamLtolSnapshot);

    // create piece + marks
    const piece = await prisma.pieceDetail.create({
      data: {
        headerId,
        mainPieceNo: parsed.mainPieceNo,
        partSuffix: parsed.partSuffix ?? null,
        pieceLabel,
        meter: parsed.meter,
        weight: parsed.weight ?? null,
        damagedMeter: parsed.damagedMeter ?? 0,
        damagedWeight: parsed.damagedWeight ?? null,
        netMeter,
        netWeight,
        reed: parsed.reed ?? null,
        pick: parsed.pick ?? null,
        width: parsed.width ?? null,
        avgInterval: stats.avgInterval,
        deltaLtol: stats.deltaLtol,
        remarks: parsed.remarks ?? null
      }
    });

    // create marks
    if (marks && marks.length) {
      const markCreates = marks.map((m, idx) => ({
        pieceId: piece.id,
        markIndex: idx + 1,
        position: m
      }));
      await prisma.pieceMark.createMany({ data: markCreates });
    }

    res.json({ ok: true, piece });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message || err.toString() });
  }
}

async function getNextPieceNumber(req, res) {
  try {
    // use util to increment counter
    const num = await getNextMainPieceNumber(prisma);
    res.json({ mainPieceNo: num });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
}

// helper to compute totals for header
async function computeHeaderTotals(tx, headerId) {
  const pieces = await tx.pieceDetail.findMany({ where: { headerId }});
  let totalMeter = 0, totalWeight = 0, totalDamagedMeter = 0, totalDamagedWeight = 0;
  for (const p of pieces) {
    totalMeter += Number(p.meter);
    totalDamagedMeter += Number(p.damagedMeter || 0);
    if (p.weight) totalWeight += Number(p.weight);
    if (p.damagedWeight) totalDamagedWeight += Number(p.damagedWeight);
  }
  const netMeter = Number((totalMeter - totalDamagedMeter).toFixed(4));
  const netWeight = totalWeight ? Number((totalWeight - totalDamagedWeight).toFixed(4)) : null;
  return { totalMeter, totalWeight, totalDamagedMeter, totalDamagedWeight, netMeter, netWeight };
}

async function confirmReceive(req, res) {
  try {
    const headerId = Number(req.params.id);
    if (!headerId) return res.status(400).json({ error: 'Invalid header id' });

    const userId = req.user?.id ?? null;

    // transaction
    const result = await prisma.$transaction(async (tx) => {
      const header = await tx.receiveHeader.findUnique({ where: { id: headerId }});
      if (!header) throw new Error('Receive header not found');
      if (header.status !== 'DRAFT') throw new Error('Only DRAFT receive can be confirmed');

      // compute totals
      const totals = await computeHeaderTotals(tx, headerId);
      if (!totals || totals.netMeter <= 0) throw new Error('No net meter to confirm');

      // lock the beam row for update (Postgres FOR UPDATE)
      // use raw query to lock:
      await tx.$queryRaw`SELECT id FROM "BeamInwardDetail" WHERE id = ${header.beamInwardDetailId} FOR UPDATE`;

      // fetch up-to-date beam detail
      const beam = await tx.beamInwardDetail.findUnique({ where: { id: header.beamInwardDetailId }});
      if (!beam) throw new Error('Beam not found');

      const remainingBefore = Number(beam.remainingMeter);
      const netReceive = Number(totals.netMeter);

      // if netReceive <= remainingBefore -> normal
      if (netReceive <= remainingBefore) {
        // create RollMaster rows from piece rows and update beam.remaining
        const pieces = await tx.pieceDetail.findMany({ where: { headerId }});
        const createdRolls = [];
        for (const p of pieces) {
          const roll = await tx.rollMaster.create({
            data: {
              pieceId: p.id,
              beamInwardDetailId: header.beamInwardDetailId,
              designId: header.designId,
              loomId: header.loomId ?? null,
              meter: Number(p.meter),
              netMeter: Number(p.netMeter),
              weight: p.weight ?? null,
              receivedById: userId,
              receiveDate: new Date(),
              qrCodeValue: JSON.stringify({
                beam_no: beam.beamNumber,
                design_no: header.designId,
                main_piece_no: p.mainPieceNo,
                piece_label: p.pieceLabel,
                net_meter: p.netMeter
              })
            }
          });
          createdRolls.push(roll);
        }

        // decrement beam.remaining
        const newRemaining = Number((remainingBefore - netReceive).toFixed(4));
        await tx.beamInwardDetail.update({
          where: { id: beam.id },
          data: { remainingMeter: newRemaining, totalMeter: beam.totalMeter }
        });

        // update header status
        await tx.receiveHeader.update({
          where: { id: headerId },
          data: { status: 'CONFIRMED' }
        });

        return { ok: true, createdRolls, beamAdjustment: null, totals };
      }

      // Overproduction case: netReceive > remainingBefore
      const overBy = Number((netReceive - remainingBefore).toFixed(4));
      const allowedTolerance = Number((beam.totalMeter * (TOLERANCE_PERCENT / 100)).toFixed(4));

      // If within tolerance and configured to auto-accept
      const autoAcceptWithinTolerance = process.env.AUTO_ACCEPT_OVERPRODUCTION === 'true';

      if (overBy <= allowedTolerance && autoAcceptWithinTolerance) {
        // accept by increasing totalMeter by overBy (preferred)
        const newTotal = Number((Number(beam.totalMeter) + overBy).toFixed(4));
        // new remaining becomes zero
        await tx.beamInwardDetail.update({
          where: { id: beam.id },
          data: { totalMeter: newTotal, remainingMeter: 0 }
        });

        // create RollMaster rows
        const pieces = await tx.pieceDetail.findMany({ where: { headerId }});
        const createdRolls = [];
        for (const p of pieces) {
          const roll = await tx.rollMaster.create({
            data: {
              pieceId: p.id,
              beamInwardDetailId: header.beamInwardDetailId,
              designId: header.designId,
              loomId: header.loomId ?? null,
              meter: Number(p.meter),
              netMeter: Number(p.netMeter),
              weight: p.weight ?? null,
              receivedById: userId,
              receiveDate: new Date(),
              qrCodeValue: JSON.stringify({
                beam_no: beam.beamNumber,
                design_no: header.designId,
                main_piece_no: p.mainPieceNo,
                piece_label: p.pieceLabel,
                net_meter: p.netMeter
              })
            }
          });
          createdRolls.push(roll);
        }

        // create BeamAdjustment (auto-approved)
        const adjustment = await tx.beamAdjustment.create({
          data: {
            beamId: beam.id,
            receiveId: headerId,
            expectedRemainingBefore: remainingBefore,
            actualReceived: netReceive,
            overBy,
            actionTaken: 'increase_total',
            newBeamTotal: newTotal,
            newRemaining: 0,
            approvedById: userId,
            approvedAt: new Date(),
            note: 'Auto-accepted within tolerance'
          }
        });

        await tx.receiveHeader.update({
          where: { id: headerId },
          data: { status: 'CONFIRMED' }
        });

        return { ok: true, createdRolls, beamAdjustment: adjustment, totals };
      }

      // Else: create BeamAdjustment as pending and return that approval is needed
      const adjustment = await tx.beamAdjustment.create({
        data: {
          beamId: beam.id,
          receiveId: headerId,
          expectedRemainingBefore: remainingBefore,
          actualReceived: netReceive,
          overBy,
          actionTaken: 'pending',
          note: 'Overproduction pending approval'
        }
      });

      // keep header as DRAFT (or mark as PENDING_APPROVAL)
      await tx.receiveHeader.update({
        where: { id: headerId },
        data: { status: 'PENDING_APPROVAL' }
      });

      return { ok: false, needApproval: true, beamAdjustment: adjustment, totals };
    }); // end transaction

    // send result
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message || err.toString() });
  }
}

async function approveOverproduction(req, res) {
  try {
    const adjId = Number(req.params.id);
    if (!adjId) return res.status(400).json({ error: 'Invalid adjustment id' });
    const { action } = req.body; // 'increase_total' | 'allow_negative' | 'reject'
    const approverId = req.user?.id ?? null;

    if (!['increase_total', 'allow_negative', 'reject'].includes(action)) return res.status(400).json({ error: 'Invalid action' });

    const result = await prisma.$transaction(async (tx) => {
      const adj = await tx.beamAdjustment.findUnique({ where: { id: adjId }});
      if (!adj) throw new Error('Adjustment not found');
      if (adj.actionTaken !== 'pending') throw new Error('Adjustment is not pending');

      const beam = await tx.beamInwardDetail.findUnique({ where: { id: adj.beamId }});
      if (!beam) throw new Error('Beam not found');

      if (action === 'reject') {
        await tx.beamAdjustment.update({
          where: { id: adjId },
          data: { actionTaken: 'rejected', approvedById: approverId, approvedAt: new Date(), note: (adj.note || '') + ' | rejected' }
        });

        // revert header to DRAFT so user can correct
        if (adj.receiveId) {
          await tx.receiveHeader.update({ where: { id: adj.receiveId }, data: { status: 'DRAFT' }});
        }

        return { ok: true, message: 'Rejected' };
      }

      const overBy = Number(adj.overBy);
      if (action === 'increase_total') {
        const newTotal = Number((Number(beam.totalMeter) + overBy).toFixed(4));
        // remaining becomes zero
        await tx.beamInwardDetail.update({
          where: { id: beam.id },
          data: { totalMeter: newTotal, remainingMeter: 0 }
        });

        await tx.beamAdjustment.update({
          where: { id: adjId },
          data: { actionTaken: 'increase_total', approvedById: approverId, approvedAt: new Date(), newBeamTotal: newTotal, newRemaining: 0 }
        });

        // Now finalize receive: create roll records and set header CONFIRMED
        if (adj.receiveId) {
          const header = await tx.receiveHeader.findUnique({ where: { id: adj.receiveId }});
          const pieces = await tx.pieceDetail.findMany({ where: { headerId: header.id }});
          for (const p of pieces) {
            await tx.rollMaster.create({
              data: {
                pieceId: p.id,
                beamInwardDetailId: header.beamInwardDetailId,
                designId: header.designId,
                loomId: header.loomId ?? null,
                meter: Number(p.meter),
                netMeter: Number(p.netMeter),
                weight: p.weight ?? null,
                receivedById: approverId,
                receiveDate: new Date(),
                qrCodeValue: JSON.stringify({
                  beam_no: beam.beamNumber,
                  design_no: header.designId,
                  main_piece_no: p.mainPieceNo,
                  piece_label: p.pieceLabel,
                  net_meter: p.netMeter
                })
              }
            });
          }
          await tx.receiveHeader.update({ where: { id: header.id }, data: { status: 'CONFIRMED' }});
        }

        return { ok: true, message: 'Approved and total increased' };
      }

      if (action === 'allow_negative') {
        // set remaining = remaining - overBy (negative allowed)
        const newRemaining = Number((Number(beam.remainingMeter) - overBy).toFixed(4));
        await tx.beamInwardDetail.update({
          where: { id: beam.id },
          data: { remainingMeter: newRemaining }
        });

        await tx.beamAdjustment.update({
          where: { id: adjId },
          data: { actionTaken: 'allow_negative', approvedById: approverId, approvedAt: new Date(), newRemaining }
        });

        if (adj.receiveId) {
          const header = await tx.receiveHeader.findUnique({ where: { id: adj.receiveId }});
          const pieces = await tx.pieceDetail.findMany({ where: { headerId: header.id }});
          for (const p of pieces) {
            await tx.rollMaster.create({
              data: {
                pieceId: p.id,
                beamInwardDetailId: header.beamInwardDetailId,
                designId: header.designId,
                loomId: header.loomId ?? null,
                meter: Number(p.meter),
                netMeter: Number(p.netMeter),
                weight: p.weight ?? null,
                receivedById: approverId,
                receiveDate: new Date(),
                qrCodeValue: JSON.stringify({
                  beam_no: beam.beamNumber,
                  design_no: header.designId,
                  main_piece_no: p.mainPieceNo,
                  piece_label: p.pieceLabel,
                  net_meter: p.netMeter
                })
              }
            });
          }
          await tx.receiveHeader.update({ where: { id: header.id }, data: { status: 'CONFIRMED' }});
        }

        return { ok: true, message: 'Approved allow negative remaining' };
      }

      throw new Error('Unhandled action');
    });

    res.json(result);

  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message || err.toString() });
  }
}

async function getReceiveHeader(req, res) {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });

    const header = await prisma.receiveHeader.findUnique({
      where: { id },
      include: {
        pieces: { include: { marks: true } },
        beamInwardDetail: true,
        design: true
      }
    });

    if (!header) return res.status(404).json({ error: 'Header not found' });
    res.json({ header });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
}

async function listReceiveHeaders(req, res) {
  try {
    const { page = 1, perPage = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(perPage);

    const [total, items] = await Promise.all([
      prisma.receiveHeader.count(),
      prisma.receiveHeader.findMany({
        skip, take: Number(perPage),
        orderBy: { createdAt: 'desc' },
        include: { pieces: true, beamInwardDetail: true, design: true }
      })
    ]);

    res.json({ total, page: Number(page), perPage: Number(perPage), items });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
}

async function cancelReceiveHeader(req, res) {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });

    // allow cancel only if DRAFT or PENDING_APPROVAL
    const header = await prisma.receiveHeader.findUnique({ where: { id }});
    if (!header) return res.status(404).json({ error: 'Header not found' });
    if (!['DRAFT','PENDING_APPROVAL'].includes(header.status)) return res.status(400).json({ error: 'Cannot cancel this receive' });

    await prisma.receiveHeader.update({ where: { id }, data: { status: 'CANCELLED' }});
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
}

module.exports = {
  createReceiveHeader,
  addPieceRow,
  getNextPieceNumber,
  confirmReceive,
  approveOverproduction,
  getReceiveHeader,
  listReceiveHeaders,
  cancelReceiveHeader
};