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

// Ordered time slot layout for an arm ("Break"/"Lunch"/"Recess" slots are
// treated as non-instructional breaks by the service).
export const timeSlotsSchema = z.object({
  timeSlots: z
    .array(z.string().trim().min(1).max(60))
    .max(20, 'Too many time slots (max 20)'),
});