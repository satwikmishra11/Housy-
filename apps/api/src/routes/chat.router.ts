import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import {
  ChatStartPayloadSchema,
  ChatMessagePayloadSchema,
  ChatBookPayloadSchema,
  ChatHistoryQuerySchema,
  type ChatStartPayload,
  type ChatMessagePayload,
  type ChatBookPayload,
  type ChatHistoryQuery,
} from '@housy/shared';
import { validateBody, validateQuery } from '../middleware/validate.js';
import { chatRateLimiter } from '../middleware/rateLimit.js';
import { requireAuth } from '../middleware/auth.js';
import { chatService } from '../services/chat.service.js';
import { handoffService } from '../services/handoff.service.js';
import { handoffRepository } from '../repositories/handoff.repository.js';
import { chatRepository } from '../repositories/chat.repository.js';
import { verifyBuyerSession } from '../auth/tokens.js';
import { ForbiddenError, UnauthorizedError, ServiceUnavailableError, DatabaseError } from '../errors/index.js';
import { config } from '../config/index.js';

export const chatRouter = Router();

function mapChatError(err: unknown, req: Request): unknown {
  if (err instanceof ServiceUnavailableError) return err;
  const isDbDown =
    err instanceof DatabaseError ||
    (err instanceof Error &&
      (err.message.includes('ECONNREFUSED') ||
        err.message.includes('Connection terminated') ||
        err.message.includes('timeout') ||
        err.message.includes('database') ||
        err.message.includes('connect')));

  if (isDbDown) {
    const lang = (req.body?.language || req.query?.language || 'en') as 'en' | 'hi' | 'gu';
    const friendlyMessages = {
      en: 'Our chat advisory service is temporarily unavailable. Please try again shortly.',
      hi: 'हमारी चैट परामर्श सेवा अस्थायी रूप से अनुपलब्ध है। कृपया कुछ समय बाद पुनः प्रयास करें।',
      gu: 'અમારી ચેટ સલાહકાર સેવા અસ્થાયી રૂપે અનુપલબ્ધ છે. કૃપા કરીને થોડા સમય પછી ફરી પ્રયાસ કરો.',
    };
    return new ServiceUnavailableError(friendlyMessages[lang] || friendlyMessages.en);
  }
  return err;
}

/**
 * Helper to extract and verify buyer session for a given conversation.
 */
async function assertBuyerConversationAccess(
  req: Request,
  targetConversationId: string,
): Promise<void> {
  const token =
    (req.headers['x-buyer-session'] as string | undefined) ||
    (req.cookies?.['buyer_session'] as string | undefined);

  if (!token) {
    throw new UnauthorizedError('Buyer session token is missing. Please start a chat session.');
  }

  const session = await verifyBuyerSession(token);
  if (!session || session.conversationId !== targetConversationId) {
    throw new ForbiddenError('Forbidden: buyer session does not match this conversation');
  }
}

/**
 * POST /api/chat/start
 * Initializes a new chat conversation for a buyer, assigns an anonymous lead, and issues a buyer session.
 */
chatRouter.post(
  '/start',
  chatRateLimiter,
  validateBody(ChatStartPayloadSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payload = req.body as ChatStartPayload;

      // Support query param ?src= for attribution (e.g. ?src=fb, ?src=google)
      const srcQuery = req.query['src'] as string | undefined;
      if (srcQuery && !payload.source) {
        payload.source = srcQuery as ChatStartPayload['source'];
      }

      const result = await chatService.startChat(payload);

      res.cookie('buyer_session', result.sessionToken, {
        httpOnly: true,
        secure: config.COOKIE_SECURE,
        sameSite: config.COOKIE_SAME_SITE,
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
        path: '/',
      });

      res.status(201).json(result);
    } catch (err) {
      next(mapChatError(err, req));
    }
  },
);

/**
 * POST /api/chat/message
 * Sends a message in an existing conversation through pre-filters, agent loop, and post-checks.
 */
chatRouter.post(
  '/message',
  chatRateLimiter,
  validateBody(ChatMessagePayloadSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payload = req.body as ChatMessagePayload;

      await assertBuyerConversationAccess(req, payload.conversationId);

      const reply = await chatService.sendMessage(payload);
      res.status(200).json(reply);
    } catch (err) {
      next(mapChatError(err, req));
    }
  },
);

/**
 * POST /api/chat/book
 * Directly books a site visit when the buyer selects a real open slot chip.
 */
chatRouter.post(
  '/book',
  chatRateLimiter,
  validateBody(ChatBookPayloadSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payload = req.body as ChatBookPayload;

      await assertBuyerConversationAccess(req, payload.conversationId);

      const bookingResult = await chatService.bookVisit(payload);
      res.status(200).json(bookingResult);
    } catch (err) {
      next(mapChatError(err, req));
    }
  },
);

/**
 * GET /api/chat/history
 * Returns message history and live conversation status for the buyer's conversation.
 */
chatRouter.get(
  '/history',
  chatRateLimiter,
  validateQuery(ChatHistoryQuerySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { conversationId } = req.query as unknown as ChatHistoryQuery;

      await assertBuyerConversationAccess(req, conversationId);

      const conversation = await chatRepository.findConversationById(conversationId);
      const history = await chatService.getHistory(conversationId);
      res.status(200).json({ data: history, status: conversation?.status ?? 'ai' });
    } catch (err) {
      next(mapChatError(err, req));
    }
  },
);

/**
 * POST /api/chat/reschedule
 * Buyer reschedules visit directly from inside chat.
 */
chatRouter.post(
  '/reschedule',
  chatRateLimiter,
  validateBody(
    z.object({
      conversationId: z.string().uuid(),
      bookingId: z.string().uuid(),
      newStartsAt: z.string(),
    }),
  ),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { conversationId, bookingId, newStartsAt } = req.body;
      await assertBuyerConversationAccess(req, conversationId);
      const result = await chatService.rescheduleVisitInChat(
        conversationId,
        bookingId,
        newStartsAt,
      );
      res.status(200).json(result);
    } catch (err) {
      next(mapChatError(err, req));
    }
  },
);

/**
 * POST /api/chat/cancel-visit
 * Buyer cancels visit directly from inside chat.
 */
chatRouter.post(
  '/cancel-visit',
  chatRateLimiter,
  validateBody(
    z.object({
      conversationId: z.string().uuid(),
      bookingId: z.string().uuid(),
    }),
  ),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { conversationId, bookingId } = req.body;
      await assertBuyerConversationAccess(req, conversationId);
      const result = await chatService.cancelVisitInChat(conversationId, bookingId);
      res.status(200).json(result);
    } catch (err) {
      next(mapChatError(err, req));
    }
  },
);

/**
 * POST /api/chat/takeover
 * Sales executive takes over chat (sets status='human', pauses AI).
 */
chatRouter.post(
  '/takeover',
  requireAuth,
  validateBody(z.object({ conversationId: z.string().uuid() })),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { conversationId } = req.body;
      const result = await handoffService.takeOverChat(conversationId, req.user!.id);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/chat/handback
 * Hands chat back to AI assistant (sets status='ai').
 */
chatRouter.post(
  '/handback',
  requireAuth,
  validateBody(z.object({ conversationId: z.string().uuid() })),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { conversationId } = req.body;
      const result = await handoffService.handBackToAssistant(conversationId);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/chat/staff-message
 * Staff posts an executive reply into the conversation.
 */
chatRouter.post(
  '/staff-message',
  requireAuth,
  validateBody(
    z.object({
      conversationId: z.string().uuid(),
      message: z.string().min(1).max(2000),
    }),
  ),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { conversationId, message } = req.body;
      const messageId = await handoffRepository.postExecutiveMessage(
        conversationId,
        req.user!.id,
        message,
      );
      res.status(200).json({ success: true, messageId });
    } catch (err) {
      next(err);
    }
  },
);
