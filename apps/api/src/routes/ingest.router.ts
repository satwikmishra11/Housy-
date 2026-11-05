import crypto from 'node:crypto';
import { Router, type Request, type Response, type NextFunction } from 'express';
import { LeadSourceSchema, LeadIngestPayloadSchema } from '@housy/shared';
import { leadRepository } from '../repositories/lead.repository.js';
import { leadIngestService } from '../services/lead-ingest.service.js';
import { BadRequestError, UnauthorizedError, ValidationError } from '../errors/index.js';

export const ingestRouter = Router();

/**
 * POST /api/ingest/:source
 * Ingests a lead from a specific marketing or portal source.
 * Authenticates using a per-source hashed API key provided in X-Source-Key or Bearer token.
 * Idempotent on external_id.
 */
ingestRouter.post(
  '/ingest/:source',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // 1. Validate source parameter
      const sourceParsed = LeadSourceSchema.safeParse(req.params['source']);
      if (!sourceParsed.success) {
        throw new BadRequestError(
          `Invalid lead source '${req.params['source']}'. Must be one of: property_portal, social_ad, website, hoarding_call`,
        );
      }
      const source = sourceParsed.data;

      // 2. Authenticate source API key
      const rawKey =
        (req.headers['x-source-key'] as string | undefined) ||
        (req.headers.authorization?.startsWith('Bearer ')
          ? req.headers.authorization.slice(7)
          : undefined);

      if (!rawKey) {
        throw new UnauthorizedError('Missing source API key. Provide via X-Source-Key header.');
      }

      const keyHash = crypto.createHash('sha256').update(rawKey.trim()).digest('hex');
      const activeKey = await leadRepository.findActiveSourceKey(source, keyHash);

      if (!activeKey) {
        throw new UnauthorizedError(
          `Invalid or deactivated source API key for source '${source}'.`,
        );
      }

      // 3. Validate payload with Zod
      const parseResult = LeadIngestPayloadSchema.safeParse(req.body);
      if (!parseResult.success) {
        const details = parseResult.error.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
          code: e.code,
        }));
        throw new ValidationError('Invalid lead ingest payload', details);
      }

      // 4. Delegate to LeadIngestService
      const outcome = await leadIngestService.ingest(parseResult.data, source);

      const statusCode = outcome.outcome === 'created' ? 201 : 200;
      res.status(statusCode).json({
        success: true,
        ...outcome,
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /api/conversations/:id/phone
 * Late phone arrival for an anonymous web chat conversation.
 * Deduplicates against existing leads and merges the conversation if an existing lead matches.
 */
ingestRouter.post(
  '/conversations/:id/phone',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const conversationId = req.params['id'] as string;
      const { phone, name } = req.body as { phone?: string; name?: string };

      if (!phone || typeof phone !== 'string') {
        throw new ValidationError('A phone number string is required');
      }

      const result = await leadIngestService.attachPhoneToConversation(
        conversationId,
        phone,
        name,
      );

      res.status(200).json({
        success: true,
        ...result,
      });
    } catch (err) {
      next(err);
    }
  },
);
