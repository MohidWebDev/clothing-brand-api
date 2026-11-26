import type { RequestHandler } from 'express';
import { getDbStatus } from '../config/db';
import { sendSuccess } from '../utils/apiResponse';

/** Liveness: the process is up. Used by the platform to decide whether to restart it. */
export const liveness: RequestHandler = (_req, res) => {
  sendSuccess(res, { status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() });
};

/** Readiness: dependencies are reachable. Used by load balancers to route traffic. */
export const readiness: RequestHandler = (_req, res) => {
  const database = getDbStatus();
  const ready = database === 'connected';
  res.status(ready ? 200 : 503).json({
    success: ready,
    data: { status: ready ? 'ready' : 'not_ready', checks: { database } },
  });
};
