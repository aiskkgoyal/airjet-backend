// /src/validators/beamIssue.validator.js
const { z } = require('zod');

const createSchema = z.object({
  beamInwardDetailId: z.number().int(),
  loomId: z.number().int().optional().nullable(),
  designId: z.number().int().optional().nullable(),
  greyLtol: z.number().optional().nullable(),
  rollLength: z.number().optional().nullable(),
  widthSplitFactor: z.number().int().min(1).optional().default(1),
  expectedFabricMeter: z.number().optional().nullable()
});

module.exports = {
  createBeamIssueSchema: createSchema
};