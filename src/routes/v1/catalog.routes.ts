import { Router } from 'express';
import * as catalog from '../../controllers/catalog.controller';
import { validate } from '../../middlewares/validate';
import {
  productFacetsQuery,
  productListQuery,
  slugParams,
  suggestQuery,
} from '../../validators/catalog.validators';

/** Public storefront endpoints. No authentication required. */
const router = Router();

router.get('/products', validate({ query: productListQuery }), catalog.listProducts);
router.get('/products/filters', validate({ query: productFacetsQuery }), catalog.productFacets);
router.get('/products/suggest', validate({ query: suggestQuery }), catalog.suggestProducts);
router.get('/products/:slug', validate({ params: slugParams }), catalog.getProduct);
router.get('/products/:slug/related', validate({ params: slugParams }), catalog.relatedProducts);

router.get('/categories', catalog.listCategories);
router.get('/categories/:slug', validate({ params: slugParams }), catalog.getCategory);
router.get('/brands', catalog.listBrands);

export default router;
