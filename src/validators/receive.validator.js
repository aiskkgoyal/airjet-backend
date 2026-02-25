// /src/validators/receive.validator.js
const { z } = require('zod');

const createHeaderSchema = z.object({
  beamInwardDetailId: z.number().int(),
  beamIssueId: z.number().int().optional().nullable(),
  designId: z.number().int(),
  loomId: z.number().int().optional().nullable(),
  // optional: operator can pass a pre-reserved mainPieceNo if they already fetched it
  note: z.string().optional()
});

const addPieceSchema = z.object({
  mainPieceNo: z.number().int(),
  partSuffix: z.string().optional().nullable(), // "A", "B" or null
  meter: z.number().positive(),
  weight: z.number().positive().optional().nullable(),
  damagedMeter: z.number().min(0).optional().default(0),
  damagedWeight: z.number().min(0).optional().nullable(),
  reed: z.number().int().optional().nullable(),
  pick: z.number().int().optional().nullable(),
  width: z.number().optional().nullable(),
  marks: z.array(z.number().nonnegative()).optional().default([]), // positions in meters
  remarks: z.string().optional().nullable()
});

module.exports = {
  createHeaderSchema,
  addPieceSchema
};