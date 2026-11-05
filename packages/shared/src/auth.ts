import { z } from 'zod';

export const UserRoleSchema = z.enum(['executive', 'sales_head']);
export type UserRole = z.infer<typeof UserRoleSchema>;

export const AuthUserSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  email: z.string().email(),
  role: UserRoleSchema,
  phone: z.string().nullable(),
});
export type AuthUser = z.infer<typeof AuthUserSchema>;

export const LoginRequestSchema = z.object({
  email: z.string().trim().email('Please enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const LoginResponseSchema = z.object({
  success: z.literal(true),
  user: AuthUserSchema,
});
export type LoginResponse = z.infer<typeof LoginResponseSchema>;

export const LogoutResponseSchema = z.object({
  success: z.literal(true),
});
export type LogoutResponse = z.infer<typeof LogoutResponseSchema>;

export const MeResponseSchema = z.object({
  success: z.literal(true),
  user: AuthUserSchema,
});
export type MeResponse = z.infer<typeof MeResponseSchema>;

export const BuyerSessionPayloadSchema = z.object({
  conversationId: z.string().uuid(),
  leadId: z.string().uuid().optional(),
});
export type BuyerSessionPayload = z.infer<typeof BuyerSessionPayloadSchema>;

export const MagicLinkTokenPayloadSchema = z.object({
  bookingId: z.string().uuid(),
  leadId: z.string().uuid(),
  purpose: z.literal('manage_visit'),
  exp: z.number(),
});
export type MagicLinkTokenPayload = z.infer<typeof MagicLinkTokenPayloadSchema>;

