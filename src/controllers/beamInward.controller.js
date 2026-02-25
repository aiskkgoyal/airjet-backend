const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { beamInwardSchema } = require('../validators/beamInward.validator');
const { generateBeamNumber } = require('../utils/beamNumber');
const { generateInwardNumber } = require('../utils/inwardNumber');

exports.createBeamInward = async (req, res) => {
  try {
    const parsed = beamInwardSchema.parse(req.body);

    const result = await prisma.$transaction(async (tx) => {

      // ✅ Generate FY based inward number
      const inwardNumber = await generateInwardNumber(tx);

      const header = await tx.beamInwardHeader.create({
        data: {
          inwardNumber,
          inwardDate: parsed.inwardDate ? new Date(parsed.inwardDate) : new Date(),
          productionType: parsed.productionType,
          sizingPartyId: parsed.sizingPartyId,
          jobPartyId: parsed.jobPartyId,
          status: "OPEN"
        }
      });

      const createdDetails = [];

      for (const row of parsed.details) {

        // ✅ Find or create Set
        let set = await tx.setMaster.findUnique({
          where: { setNumber: row.setNumber }
        });

        if (!set) {
          set = await tx.setMaster.create({
            data: { setNumber: row.setNumber }
          });
        }

        // ✅ Generate FY based Beam Number
        const beamNumber = await generateBeamNumber(tx);

        const detail = await tx.beamInwardDetail.create({
          data: {
            headerId: header.id,
            beamNumber,
            beamNameId: row.beamNameId,
            setId: set.id,
            sizingMeter: row.sizingMeter,
            ltolMeter: row.ltolMeter,
            remainingMeter: row.sizingMeter,
            totalMeter: row.sizingMeter,
            status: "IN_STOCK"
          }
        });

        createdDetails.push(detail);
      }

      return { header, details: createdDetails };
    });

    res.json(result);

  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message });
  }
};