import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { validateRequest } from '../middleware/validate.js';
import { handoffService } from '../services/handoff.service.js';
import { handoffRepository } from '../repositories/handoff.repository.js';
import { chatRepository } from '../repositories/chat.repository.js';
import { HandoffStatusSchema } from '@housy/shared';
import { NotFoundError } from '../errors/AppError.js';

export const handoffsRouter = Router();

const HandoffFilterQuerySchema = z.object({
  status: HandoffStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  page: z.coerce.number().int().min(1).optional().default(1),
});

const HandoffIdParamSchema = z.object({
  id: z.string().uuid({ message: 'Handoff ID must be a valid UUID' }),
});

const PostMessageBodySchema = z.object({
  message: z.string().min(1, 'Message cannot be empty').max(2000),
});

/**
 * GET /api/handoffs
 * Lists handoffs for executive inbox:
 * - Sales executives see handoffs assigned to them.
 * - Sales head sees all handoffs.
 */
handoffsRouter.get(
  '/handoffs',
  requireAuth,
  validateRequest({ query: HandoffFilterQuerySchema }),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { status, limit, page } = req.query as unknown as z.infer<typeof HandoffFilterQuerySchema>;
      const offset = (page - 1) * limit;

      const result = await handoffService.listHandoffs(req.user!, {
        status,
        limit,
        offset,
      });

      res.status(200).json({
        success: true,
        data: result.data,
        totalCount: result.totalCount,
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/handoffs/:id/transcript
 * Returns conversation transcript messages for a handoff.
 */
handoffsRouter.get(
  '/handoffs/:id/transcript',
  requireAuth,
  validateRequest({ params: HandoffIdParamSchema }),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const handoffId = req.params['id'] as string;
      const item = await handoffRepository.findHandoffById(handoffId);
      if (!item) {
        throw new NotFoundError('Handoff not found');
      }
      if (req.user!.role === 'executive' && item.executiveId !== req.user!.id) {
        throw new NotFoundError('Handoff not found');
      }
      const messages = await chatRepository.getMessages(item.conversationId);
      res.status(200).json({ success: true, data: messages });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/handoffs/:id/accept
 * Executive marks a handoff as accepted.
 */
handoffsRouter.post(
  '/handoffs/:id/accept',
  requireAuth,
  validateRequest({ params: HandoffIdParamSchema }),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const handoffId = req.params['id'] as string;
      const result = await handoffService.acceptHandoff(handoffId, req.user!);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/handoffs/:id/message
 * Executive posts a message into the conversation thread (pausing AI assistant).
 */
handoffsRouter.post(
  '/handoffs/:id/message',
  requireAuth,
  validateRequest({ params: HandoffIdParamSchema, body: PostMessageBodySchema }),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const handoffId = req.params['id'] as string;
      const { message } = req.body as z.infer<typeof PostMessageBodySchema>;

      const result = await handoffService.postMessage(handoffId, req.user!, message);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },
);

