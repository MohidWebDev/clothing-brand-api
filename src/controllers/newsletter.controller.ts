import type { Request, RequestHandler } from 'express';
import { newsletterService } from '../services/newsletter.service';
import { sendSuccess } from '../utils/apiResponse';
import type { SubscribeBody } from '../validators/newsletter.validators';

export const subscribe: RequestHandler = async (req: Request, res) => {
  await newsletterService.subscribe(req.validated.body as SubscribeBody);
  sendSuccess(res, null, { message: 'Thank you. You are on the list.' });
};
