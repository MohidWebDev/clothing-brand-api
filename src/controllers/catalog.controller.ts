import type { Request, RequestHandler } from 'express';
import { brandService } from '../services/brand.service';
import { categoryService } from '../services/category.service';
import { inventoryService } from '../services/inventory.service';
import { productService } from '../services/product.service';
import { sendCreated, sendNoContent, sendSuccess } from '../utils/apiResponse';
import type {
  AdjustStockBody,
  AdminProductListQuery,
  CreateBrandBody,
  CreateCategoryBody,
  CreateProductBody,
  CreateVariantBody,
  ProductFacetsQuery,
  ProductListQuery,
  UpdateBrandBody,
  UpdateCategoryBody,
  UpdateProductBody,
  UpdateVariantBody,
} from '../validators/catalog.validators';

const body = <T>(req: Request) => req.validated.body as T;
const query = <T>(req: Request) => req.validated.query as T;
const params = (req: Request) =>
  req.validated.params as { id: string; variantId: string; slug: string };

// ------------------------------------------------------------------ public

export const listProducts: RequestHandler = async (req, res) => {
  const { items, meta } = await productService.listPublic(query<ProductListQuery>(req));
  sendSuccess(res, items, { meta });
};

export const productFacets: RequestHandler = async (req, res) => {
  sendSuccess(res, await productService.facets(query<ProductFacetsQuery>(req)));
};

export const suggestProducts: RequestHandler = async (req, res) => {
  sendSuccess(res, await productService.suggest(query<{ q: string }>(req).q));
};

export const getProduct: RequestHandler = async (req, res) => {
  sendSuccess(res, await productService.getPublicBySlug(params(req).slug));
};

export const relatedProducts: RequestHandler = async (req, res) => {
  sendSuccess(res, await productService.related(params(req).slug));
};

export const listCategories: RequestHandler = async (_req, res) => {
  sendSuccess(res, await categoryService.tree());
};

export const getCategory: RequestHandler = async (req, res) => {
  sendSuccess(res, await categoryService.getBySlug(params(req).slug));
};

export const listBrands: RequestHandler = async (_req, res) => {
  sendSuccess(res, await brandService.listPublic());
};

// ------------------------------------------------------------ admin: brands

export const adminListBrands: RequestHandler = async (_req, res) => {
  sendSuccess(res, await brandService.listAdmin());
};

export const createBrand: RequestHandler = async (req, res) => {
  sendCreated(res, await brandService.create(body<CreateBrandBody>(req)));
};

export const updateBrand: RequestHandler = async (req, res) => {
  sendSuccess(res, await brandService.update(params(req).id, body<UpdateBrandBody>(req)));
};

export const deleteBrand: RequestHandler = async (req, res) => {
  await brandService.remove(params(req).id);
  sendNoContent(res);
};

// -------------------------------------------------------- admin: categories

export const adminListCategories: RequestHandler = async (_req, res) => {
  sendSuccess(res, await categoryService.listAdmin());
};

export const createCategory: RequestHandler = async (req, res) => {
  sendCreated(res, await categoryService.create(body<CreateCategoryBody>(req)));
};

export const updateCategory: RequestHandler = async (req, res) => {
  sendSuccess(res, await categoryService.update(params(req).id, body<UpdateCategoryBody>(req)));
};

export const deleteCategory: RequestHandler = async (req, res) => {
  await categoryService.remove(params(req).id);
  sendNoContent(res);
};

// ---------------------------------------------------------- admin: products

export const adminListProducts: RequestHandler = async (req, res) => {
  const { items, meta } = await productService.listAdmin(query<AdminProductListQuery>(req));
  sendSuccess(res, items, { meta });
};

export const adminGetProduct: RequestHandler = async (req, res) => {
  sendSuccess(res, await productService.getAdmin(params(req).id));
};

export const createProduct: RequestHandler = async (req, res) => {
  sendCreated(res, await productService.create(body<CreateProductBody>(req), req.user!.id));
};

export const updateProduct: RequestHandler = async (req, res) => {
  sendSuccess(res, await productService.update(params(req).id, body<UpdateProductBody>(req)));
};

export const deleteProduct: RequestHandler = async (req, res) => {
  await productService.remove(params(req).id);
  sendNoContent(res);
};

export const addVariant: RequestHandler = async (req, res) => {
  sendCreated(
    res,
    await productService.addVariant(params(req).id, body<CreateVariantBody>(req), req.user!.id),
  );
};

export const updateVariant: RequestHandler = async (req, res) => {
  const { id, variantId } = params(req);
  sendSuccess(res, await productService.updateVariant(id, variantId, body<UpdateVariantBody>(req)));
};

export const deleteVariant: RequestHandler = async (req, res) => {
  const { id, variantId } = params(req);
  sendSuccess(res, await productService.removeVariant(id, variantId));
};

// --------------------------------------------------------- admin: inventory

export const adjustStock: RequestHandler = async (req, res) => {
  const { id, variantId } = params(req);
  sendSuccess(
    res,
    await inventoryService.adjustStock(id, variantId, body<AdjustStockBody>(req), req.user!.id),
  );
};

export const lowStock: RequestHandler = async (req, res) => {
  const { items, meta } = await inventoryService.lowStock(query(req));
  sendSuccess(res, items, { meta });
};

export const stockMovements: RequestHandler = async (req, res) => {
  const { items, meta } = await inventoryService.movements(query(req));
  sendSuccess(res, items, { meta });
};
