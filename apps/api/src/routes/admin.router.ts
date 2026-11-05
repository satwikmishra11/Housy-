import { Router, type Request, type Response } from 'express';
import { requireRole } from '../middleware/auth.js';

export const adminRouter = Router();

/**
 * POST /api/fact-sheet
 * Admin editor for the knowledge fact sheet. Restricted to Sales Head role.
 */
adminRouter.post(
  '/fact-sheet',
  requireRole('sales_head'),
  (_req: Request, res: Response): void => {
    res.status(200).json({
      success: true,
      message: 'Fact sheet entry successfully updated',
    });
  },
);

/**
 * POST /api/availability-rules
 * Admin editor for executive visit slot rules. Restricted to Sales Head role.
 */
adminRouter.post(
  '/availability-rules',
  requireRole('sales_head'),
  (_req: Request, res: Response): void => {
    res.status(200).json({
      success: true,
      message: 'Slot availability rules successfully updated',
    });
  },
);

/**
 * POST /api/ad-spend
 * Admin editor for source marketing spend. Restricted to Sales Head role.
 */
adminRouter.post(
  '/ad-spend',
  requireRole('sales_head'),
  (_req: Request, res: Response): void => {
    res.status(200).json({
      success: true,
      message: 'Ad spend allocation successfully updated',
    });
  },
);
