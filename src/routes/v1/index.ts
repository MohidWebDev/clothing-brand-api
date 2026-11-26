import { Router } from 'express';
import adminRoutes from './admin.routes';
import authRoutes from './auth.routes';
import catalogRoutes from './catalog.routes';
import healthRoutes from './health.routes';

const router = Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/admin', adminRoutes);
router.use('/', catalogRoutes);

export default router;
