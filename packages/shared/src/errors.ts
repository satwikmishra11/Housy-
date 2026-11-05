import { z } from 'zod';

export const ErrorDetailSchema = z.object({
  field: z.string().optional(),
  message: z.string(),
  code: z.string().optional(),
});

export type ErrorDetail = z.infer<typeof ErrorDetailSchema>;

export const ApiErrorResponseSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    statusCode: z.number(),
    details: z.array(ErrorDetailSchema).optional(),
    alternatives: z
      .array(
        z.object({
          startsAt: z.string(),
          endsAt: z.string(),
          displayTime: z.string().optional(),
        }),
      )
      .optional(),
    timestamp: z.string().datetime(),
    requestId: z.string().optional(),
  }),
});

export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;

