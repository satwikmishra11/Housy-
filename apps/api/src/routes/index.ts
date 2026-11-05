import { Router } from 'express';
import { healthRouter } from './health.router.js';
import { authRouter } from './auth.router.js';
import { leadsRouter } from './leads.router.js';
import { adminRouter } from './admin.router.js';
import { ingestRouter } from './ingest.router.js';

export const apiRouter = Router();

apiRouter.use(healthRouter);
apiRouter.use(authRouter);
apiRouter.use(ingestRouter);
apiRouter.use(leadsRouter);
apiRouter.use(adminRouter);

