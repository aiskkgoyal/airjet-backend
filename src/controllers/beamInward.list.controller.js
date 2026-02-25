// /src/controllers/beamInward.list.controller.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

exports.listBeamInwards = async (req, res) => {
  try {
    const { page = 1, perPage = 20, q } = req.query;
    const skip = (Number(page) - 1) * Number(perPage);

    const where = q ? {
      OR: [
        { inwardNumber: { contains: q, mode: 'insensitive' } },
        { productionType: { contains: q, mode: 'insensitive' } }
      ]
    } : {};

    const [total, items] = await Promise.all([
      prisma.beamInwardHeader.count({ where }),
      prisma.beamInwardHeader.findMany({
        where,
        skip,
        take: Number(perPage),
        orderBy: { createdAt: 'desc' },
        include: {
          details: {
            include: {
              beamName: true,
              set: true
            }
          },
          sizingParty: true,
          jobParty: true
        }
      })
    ]);

    res.json({
      total,
      page: Number(page),
      perPage: Number(perPage),
      items
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};