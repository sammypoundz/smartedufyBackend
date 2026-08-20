"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.promotionController = void 0;
const promotionService_1 = require("../services/promotionService");
const zod_1 = require("zod");
const promoteSchema = zod_1.z.object({
    sourceArmId: zod_1.z.string(),
    targetArmId: zod_1.z.string(),
    studentIds: zod_1.z.array(zod_1.z.string()).optional(),
    academicYearId: zod_1.z.string().optional(),
    termId: zod_1.z.string().optional(),
});
exports.promotionController = {
    promote: async (req, res) => {
        try {
            const { sourceArmId, targetArmId, studentIds, academicYearId, termId } = promoteSchema.parse(req.body);
            const result = await promotionService_1.promotionService.promoteStudents(sourceArmId, targetArmId, studentIds, academicYearId, termId);
            res.json(result);
        }
        catch (err) {
            if (err.name === 'ZodError')
                return res.status(400).json({ error: err.errors });
            console.error(err);
            res.status(500).json({ error: 'Promotion failed' });
        }
    },
};
