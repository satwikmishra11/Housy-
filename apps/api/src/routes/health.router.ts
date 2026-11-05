import { Router, type Request, type Response, type NextFunction } from 'express';
import { HealthService, healthService } from '../services/health.service.js';

export function createHealthRouter(service: HealthService = healthService): Router {
  const router = Router();

  router.get('/health', async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const health = await service.getHealth();
      const statusCode = health.status === 'ok' ? 200 : 503;
      res.status(statusCode).json(health);
    } catch (err) {
      next(err);
    }
  });

  return router;
}

export const healthRouter = createHealthRouter();

