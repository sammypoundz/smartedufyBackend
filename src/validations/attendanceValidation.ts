import { z } from 'zod';

export const markAttendanceSchema = z.object({
  date: z.string().datetime(),
  records: z.array(
    z.object({
      studentId: z.string(),
      present: z.boolean(),
    })
  ),
});