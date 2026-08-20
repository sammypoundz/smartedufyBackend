import { z } from 'zod';

export const bulkTimetableSchema = z.object({
  entries: z.array(
    z.object({
      dayOfWeek: z.string(),
      timeSlot: z.string(),
      subjectId: z.string().optional(),
    })
  ),
});