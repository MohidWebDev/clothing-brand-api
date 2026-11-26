import { Router } from 'express';
import * as catalog from '../../controllers/catalog.controller';
import { uploadImages } from '../../controllers/upload.controller';
import { PERMISSIONS as P } from '../../constants';
import { authenticate, authorize, authorizeAny } from '../../middlewares/auth';
import { createRateLimiter } from '../../middlewares/rateLimiter';
import { imageUpload } from '../../middlewares/upload';
import { validate } from '../../middlewares/validate';
import {
  adjustStockBody,
  adminProductListQuery,
  createBrandBody,
  createCategoryBody,
  createProductBody,
  createVariantBody,
  idParams,
  lowStockQuery,
  movementsQuery,
  updateBrandBody,
  updateCategoryBody,
  updateProductBody,
  updateVariantBody,
  variantParams,
} from '../../validators/catalog.validators';

/** Back-office endpoints. Every route needs a signed-in user holding the right permission. */
const router = Router();
router.use(authenticate);

// Products
router.get(
  '/products',
  authorize(P.INVENTORY_READ),
  validate({ query: adminProductListQuery }),
  catalog.adminListProducts,
);
router.get(
  '/products/:id',
  authorize(P.INVENTORY_READ),
  validate({ params: idParams }),
  catalog.adminGetProduct,
);
router.post(
  '/products',
  authorize(P.PRODUCT_CREATE),
  validate({ body: createProductBody }),
  catalog.createProduct,
);
router.patch(
  '/products/:id',
  authorize(P.PRODUCT_UPDATE),
  validate({ params: idParams, body: updateProductBody }),
  catalog.updateProduct,
);
router.delete(
  '/products/:id',
  authorize(P.PRODUCT_DELETE),
  validate({ params: idParams }),
  catalog.deleteProduct,
);

// Variants
router.post(
  '/products/:id/variants',
  authorize(P.PRODUCT_UPDATE),
  validate({ params: idParams, body: createVariantBody }),
  catalog.addVariant,
);
router.patch(
  '/products/:id/variants/:variantId',
  authorize(P.PRODUCT_UPDATE),
  validate({ params: variantParams, body: updateVariantBody }),
  catalog.updateVariant,
);
router.delete(
  '/products/:id/variants/:variantId',
  authorize(P.PRODUCT_UPDATE),
  validate({ params: variantParams }),
  catalog.deleteVariant,
);

// Inventory
router.patch(
  '/inventory/:id/variants/:variantId/stock',
  authorize(P.INVENTORY_UPDATE),
  validate({ params: variantParams, body: adjustStockBody }),
  catalog.adjustStock,
);
router.get(
  '/inventory/low-stock',
  authorize(P.INVENTORY_READ),
  validate({ query: lowStockQuery }),
  catalog.lowStock,
);
router.get(
  '/inventory/movements',
  authorize(P.INVENTORY_READ),
  validate({ query: movementsQuery }),
  catalog.stockMovements,
);

// Brands
router.get('/brands', authorize(P.BRAND_MANAGE), catalog.adminListBrands);
router.post(
  '/brands',
  authorize(P.BRAND_MANAGE),
  validate({ body: createBrandBody }),
  catalog.createBrand,
);
router.patch(
  '/brands/:id',
  authorize(P.BRAND_MANAGE),
  validate({ params: idParams, body: updateBrandBody }),
  catalog.updateBrand,
);
router.delete(
  '/brands/:id',
  authorize(P.BRAND_MANAGE),
  validate({ params: idParams }),
  catalog.deleteBrand,
);

// Categories
router.get('/categories', authorize(P.CATEGORY_MANAGE), catalog.adminListCategories);
router.post(
  '/categories',
  authorize(P.CATEGORY_MANAGE),
  validate({ body: createCategoryBody }),
  catalog.createCategory,
);
router.patch(
  '/categories/:id',
  authorize(P.CATEGORY_MANAGE),
  validate({ params: idParams, body: updateCategoryBody }),
  catalog.updateCategory,
);
router.delete(
  '/categories/:id',
  authorize(P.CATEGORY_MANAGE),
  validate({ params: idParams }),
  catalog.deleteCategory,
);

// Image uploads (products, variants, brands, categories, banners)
router.post(
  '/uploads/images',
  authorizeAny(
    P.PRODUCT_CREATE,
    P.PRODUCT_UPDATE,
    P.BRAND_MANAGE,
    P.CATEGORY_MANAGE,
    P.CONTENT_MANAGE,
  ),
  createRateLimiter({ windowMs: 60_000, limit: 30, message: 'Too many uploads, slow down' }),
  imageUpload,
  uploadImages,
);

export default router;
