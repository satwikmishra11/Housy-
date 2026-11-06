import { Router, type Request, type Response, type NextFunction } from 'express';
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
import { chatService } from '../services/chat.service.js';
import { verifyBuyerSession } from '../auth/tokens.js';
import { ForbiddenError, UnauthorizedError } from '../errors/index.js';
import { config } from '../config/index.js';

export const chatRouter = Router();

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
        secure: config.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
        path: '/',
      });

      res.status(201).json(result);
    } catch (err) {
      next(err);
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
      next(err);
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
      next(err);
    }
  },
);

/**
 * GET /api/chat/history
 * Returns message history for the buyer's conversation.
 */
chatRouter.get(
  '/history',
  chatRateLimiter,
  validateQuery(ChatHistoryQuerySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { conversationId } = req.query as unknown as ChatHistoryQuery;

      await assertBuyerConversationAccess(req, conversationId);

      const history = await chatService.getHistory(conversationId);
      res.status(200).json({ data: history });
    } catch (err) {
      next(err);
    }
  },
);
