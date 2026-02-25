const { z } = require('zod');

const detailSchema = z.object({
  beamNameId: z.number().optional(),
  setNumber: z.string(),
  sizingMeter: z.number(),
  ltolMeter: z.number().optional()
});

exports.beamInwardSchema = z.object({
  inwardDate: z.string().optional(),
  productionType: z.enum(["OWN", "JOB"]),
  sizingPartyId: z.number().optional(),
  jobPartyId: z.number().optional(),
  details: z.array(detailSchema).min(1)
});