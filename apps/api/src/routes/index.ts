import { Router } from 'express';
import { healthRouter } from './health.router.js';
import { authRouter } from './auth.router.js';
import { leadsRouter } from './leads.router.js';
import { adminRouter } from './admin.router.js';
import { ingestRouter } from './ingest.router.js';
import { visitsRouter } from './visits.router.js';
import { chatRouter } from './chat.router.js';
import { handoffsRouter } from './handoffs.router.js';
import { outboxRouter } from './outbox.router.js';
import { internalRouter } from './internal.router.js';
import { demoRouter } from './demo.router.js';
import { dashboardRouter } from './dashboard.router.js';

export const apiRouter = Router();

apiRouter.use(healthRouter);
apiRouter.use(authRouter);
apiRouter.use(ingestRouter);
apiRouter.use(leadsRouter);
apiRouter.use(adminRouter);
apiRouter.use(visitsRouter);
apiRouter.use('/chat', chatRouter);
apiRouter.use(handoffsRouter);
apiRouter.use(outboxRouter);
apiRouter.use(internalRouter);
apiRouter.use(demoRouter);
apiRouter.use(dashboardRouter);



