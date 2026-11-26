const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const secured = [{ cookieAuth: [] }];
const error = (description: string) => ({
  description,
  content: { 'application/json': { schema: ref('ErrorResponse') } },
});
const ok = (description: string, schema?: Record<string, unknown>) => ({
  description,
  content: {
    'application/json': {
      schema: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          ...(schema && { data: schema }),
          meta: ref('PaginationMeta'),
        },
      },
    },
  },
});
const body = (name: string) => ({
  required: true,
  content: { 'application/json': { schema: ref(name) } },
});
const query = (
  name: string,
  description: string,
  schema: Record<string, unknown> = { type: 'string' },
) => ({
  name,
  in: 'query',
  description,
  schema,
});
const idParam = { name: 'id', in: 'path', required: true, schema: { type: 'string' } };
const variantParam = { name: 'variantId', in: 'path', required: true, schema: { type: 'string' } };
const slugParam = { name: 'slug', in: 'path', required: true, schema: { type: 'string' } };
const paging = [
  query('page', 'Page number, from 1', { type: 'integer', default: 1 }),
  query('limit', 'Items per page (max 100)', { type: 'integer', default: 20 }),
];
const forbidden = error('Missing permission');
const unauthenticated = error('Not signed in');

export const catalogTags = [
  {
    name: 'Catalog',
    description: 'Public storefront: products, categories, brands. No sign-in needed.',
  },
  { name: 'Admin: Products', description: 'Product, variant and inventory management.' },
  { name: 'Admin: Catalog', description: 'Brand and category management, image uploads.' },
];

export const catalogPaths = {
  '/products': {
    get: {
      tags: ['Catalog'],
      summary: 'List and search products',
      description:
        'Filters combine with AND. `size` and `color` must match the same in-stock variant. ' +
        'Multiple values can be comma separated (`size=M,L`). Prices are whole PKR.',
      parameters: [
        ...paging,
        query('q', 'Search text (relevance ranked)'),
        query('category', 'Category slug; includes subcategories'),
        query('brand', 'Brand slug(s)'),
        query('gender', 'men, women, unisex, boys, girls, kids'),
        query('fabric', 'Fabric(s), e.g. lawn,khaddar'),
        query('size', 'e.g. M,L or 32'),
        query('color', 'Color name(s), e.g. black,navy'),
        query('minPrice', 'Minimum price (PKR)', { type: 'integer' }),
        query('maxPrice', 'Maximum price (PKR)', { type: 'integer' }),
        query('inStock', 'Only products with stock', { type: 'boolean' }),
        query('onSale', 'Only discounted products', { type: 'boolean' }),
        query('sort', 'newest, price_asc, price_desc, popular, rating, relevance', {
          type: 'string',
          enum: ['newest', 'price_asc', 'price_desc', 'popular', 'rating', 'relevance'],
        }),
      ],
      responses: {
        '200': ok('Page of product cards', { type: 'array', items: ref('ProductCard') }),
        '400': error('Invalid filters'),
      },
    },
  },
  '/products/filters': {
    get: {
      tags: ['Catalog'],
      summary: 'Filter options with counts for the listing sidebar',
      description:
        'Accepts the same filters as /products. Each facet is counted with every filter except its own, ' +
        'so selecting a size still shows the other sizes. Category counts include subcategories.',
      parameters: [
        query('q', 'Search text'),
        query('category', 'Category slug'),
        query('brand', 'Brand slug(s)'),
        query('gender', 'Gender(s)'),
        query('fabric', 'Fabric(s)'),
        query('size', 'Size(s)'),
        query('color', 'Color name(s)'),
        query('minPrice', 'Minimum price (PKR)', { type: 'integer' }),
        query('maxPrice', 'Maximum price (PKR)', { type: 'integer' }),
        query('inStock', 'Only products with stock', { type: 'boolean' }),
        query('onSale', 'Only discounted products', { type: 'boolean' }),
      ],
      responses: { '200': ok('Facets') },
    },
  },
  '/products/suggest': {
    get: {
      tags: ['Catalog'],
      summary: 'Search-as-you-type suggestions',
      parameters: [{ ...query('q', 'At least 2 characters'), required: true }],
      responses: { '200': ok('Up to 8 suggestions'), '400': error('Query too short') },
    },
  },
  '/products/{slug}': {
    get: {
      tags: ['Catalog'],
      summary: 'Product detail with variants',
      parameters: [slugParam],
      responses: {
        '200': ok('Product', ref('Product')),
        '404': error('Not found or not published'),
      },
    },
  },
  '/products/{slug}/related': {
    get: {
      tags: ['Catalog'],
      summary: 'Related products from the same category',
      parameters: [slugParam],
      responses: { '200': ok('Up to 8 products'), '404': error('Not found') },
    },
  },
  '/categories': {
    get: {
      tags: ['Catalog'],
      summary: 'Category tree',
      responses: { '200': ok('Nested categories') },
    },
  },
  '/categories/{slug}': {
    get: {
      tags: ['Catalog'],
      summary: 'Category with children and breadcrumb',
      parameters: [slugParam],
      responses: { '200': ok('Category'), '404': error('Not found') },
    },
  },
  '/brands': {
    get: { tags: ['Catalog'], summary: 'Active brands', responses: { '200': ok('Brands') } },
  },

  '/admin/products': {
    get: {
      tags: ['Admin: Products'],
      summary: 'List all products including drafts',
      description: 'Requires `inventory:read`.',
      security: secured,
      parameters: [
        ...paging,
        query('q', 'Name or SKU'),
        query('status', 'draft, active, archived'),
        query('category', 'Category id'),
        query('brand', 'Brand id'),
      ],
      responses: { '200': ok('Page of products'), '401': unauthenticated, '403': forbidden },
    },
    post: {
      tags: ['Admin: Products'],
      summary: 'Create a product (optionally with variants)',
      description: 'Requires `product:create`. Prices are whole PKR. SKUs must be unique.',
      security: secured,
      requestBody: body('CreateProductRequest'),
      responses: {
        '201': ok('Created', ref('Product')),
        '400': error('Validation failed'),
        '409': error('SKU already in use'),
        '403': forbidden,
      },
    },
  },
  '/admin/products/{id}': {
    get: {
      tags: ['Admin: Products'],
      summary: 'Get a product',
      security: secured,
      parameters: [idParam],
      responses: { '200': ok('Product'), '404': error('Not found') },
    },
    patch: {
      tags: ['Admin: Products'],
      summary: 'Update a product (requires `product:update`)',
      security: secured,
      parameters: [idParam],
      requestBody: body('CreateProductRequest'),
      responses: { '200': ok('Updated'), '400': error('Validation failed') },
    },
    delete: {
      tags: ['Admin: Products'],
      summary: 'Soft delete a product (requires `product:delete`)',
      security: secured,
      parameters: [idParam],
      responses: { '204': { description: 'Deleted' } },
    },
  },
  '/admin/products/{id}/variants': {
    post: {
      tags: ['Admin: Products'],
      summary: 'Add a variant (size + color + SKU)',
      security: secured,
      parameters: [idParam],
      requestBody: body('CreateVariantRequest'),
      responses: { '201': ok('Variant added'), '409': error('SKU already in use') },
    },
  },
  '/admin/products/{id}/variants/{variantId}': {
    patch: {
      tags: ['Admin: Products'],
      summary: 'Update a variant (stock is changed via inventory)',
      security: secured,
      parameters: [idParam, variantParam],
      responses: { '200': ok('Updated') },
    },
    delete: {
      tags: ['Admin: Products'],
      summary: 'Remove a variant',
      security: secured,
      parameters: [idParam, variantParam],
      responses: {
        '200': ok('Removed'),
        '409': error('Last active variant of a published product'),
      },
    },
  },
  '/admin/inventory/{id}/variants/{variantId}/stock': {
    patch: {
      tags: ['Admin: Products'],
      summary: 'Adjust stock by `delta` or set it to an exact `set` value',
      description:
        'Requires `inventory:update`. Atomic: stock can never go below zero. Every change is recorded in the movement ledger.',
      security: secured,
      parameters: [idParam, variantParam],
      requestBody: body('AdjustStockRequest'),
      responses: { '200': ok('New stock level'), '409': error('Not enough stock') },
    },
  },
  '/admin/inventory/low-stock': {
    get: {
      tags: ['Admin: Products'],
      summary: 'Variants at or below their low-stock threshold',
      security: secured,
      parameters: paging,
      responses: { '200': ok('Page of low-stock variants') },
    },
  },
  '/admin/inventory/movements': {
    get: {
      tags: ['Admin: Products'],
      summary: 'Stock movement ledger',
      security: secured,
      parameters: [
        ...paging,
        query('productId', 'Filter by product'),
        query('variantId', 'Filter by variant'),
      ],
      responses: { '200': ok('Page of movements') },
    },
  },
  '/admin/brands': {
    get: {
      tags: ['Admin: Catalog'],
      summary: 'List brands incl. inactive (requires `brand:manage`)',
      security: secured,
      responses: { '200': ok('Brands') },
    },
    post: {
      tags: ['Admin: Catalog'],
      summary: 'Create a brand',
      security: secured,
      responses: { '201': ok('Created'), '409': error('Name already used') },
    },
  },
  '/admin/brands/{id}': {
    patch: {
      tags: ['Admin: Catalog'],
      summary: 'Update a brand',
      security: secured,
      parameters: [idParam],
      responses: { '200': ok('Updated') },
    },
    delete: {
      tags: ['Admin: Catalog'],
      summary: 'Delete a brand',
      security: secured,
      parameters: [idParam],
      responses: { '204': { description: 'Deleted' }, '409': error('Brand still has products') },
    },
  },
  '/admin/categories': {
    get: {
      tags: ['Admin: Catalog'],
      summary: 'Category tree incl. inactive (requires `category:manage`)',
      security: secured,
      responses: { '200': ok('Tree') },
    },
    post: {
      tags: ['Admin: Catalog'],
      summary: 'Create a category (max 3 levels deep)',
      security: secured,
      responses: { '201': ok('Created') },
    },
  },
  '/admin/categories/{id}': {
    patch: {
      tags: ['Admin: Catalog'],
      summary: 'Update or move a category',
      security: secured,
      parameters: [idParam],
      responses: { '200': ok('Updated') },
    },
    delete: {
      tags: ['Admin: Catalog'],
      summary: 'Delete a category',
      security: secured,
      parameters: [idParam],
      responses: {
        '204': { description: 'Deleted' },
        '409': error('Has subcategories or products'),
      },
    },
  },
  '/admin/uploads/images': {
    post: {
      tags: ['Admin: Catalog'],
      summary: 'Upload up to 10 images (JPEG, PNG, WebP, AVIF)',
      description:
        'Multipart form, field name `images`, max 5 MB each. Files are checked by content, not filename. Returns the URLs and publicIds to store on the product.',
      security: secured,
      requestBody: {
        required: true,
        content: {
          'multipart/form-data': {
            schema: {
              type: 'object',
              properties: {
                images: { type: 'array', items: { type: 'string', format: 'binary' } },
              },
            },
          },
        },
      },
      responses: {
        '201': ok('Uploaded'),
        '400': error('Not an image'),
        '413': error('Too large'),
        '503': error('Storage not configured'),
      },
    },
  },
};

const str = (extra: Record<string, unknown> = {}) => ({ type: 'string', ...extra });
const int = (extra: Record<string, unknown> = {}) => ({ type: 'integer', ...extra });

export const catalogSchemas = {
  PaginationMeta: {
    type: 'object',
    properties: {
      page: int(),
      limit: int(),
      total: int(),
      totalPages: int(),
      hasNextPage: { type: 'boolean' },
      hasPrevPage: { type: 'boolean' },
    },
  },
  Image: { type: 'object', properties: { url: str({ format: 'uri' }), alt: str() } },
  ProductCard: {
    type: 'object',
    properties: {
      id: str(),
      name: str(),
      slug: str(),
      brand: { type: 'object', properties: { id: str(), name: str(), slug: str() } },
      category: { type: 'object', properties: { id: str(), name: str(), slug: str() } },
      gender: str(),
      images: { type: 'array', items: ref('Image') },
      price: int({ description: 'Lowest variant price, whole PKR' }),
      priceMax: int(),
      compareAtPrice: int({ nullable: true }),
      onSale: { type: 'boolean' },
      discountPercent: int(),
      swatches: {
        type: 'array',
        items: { type: 'object', properties: { name: str(), hex: str() } },
      },
      sizes: { type: 'array', items: str() },
      inStock: { type: 'boolean' },
      ratingAverage: { type: 'number' },
      ratingCount: int(),
    },
  },
  Product: {
    type: 'object',
    description: 'Product card fields plus description, fabric, tags, seo and variants.',
    properties: {
      id: str(),
      name: str(),
      slug: str(),
      description: str(),
      fabric: str(),
      tags: { type: 'array', items: str() },
      variants: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: str(),
            sku: str(),
            size: str(),
            color: { type: 'object', properties: { name: str(), hex: str() } },
            price: int(),
            inStock: { type: 'boolean' },
            available: int({ description: 'Stock capped at 10 for display' }),
            lowStock: { type: 'boolean' },
          },
        },
      },
    },
  },
  CreateVariantRequest: {
    type: 'object',
    required: ['sku', 'size', 'color'],
    properties: {
      sku: str({ example: 'UT-001-BLK-M' }),
      size: str({ example: 'M' }),
      color: {
        type: 'object',
        required: ['name', 'hex'],
        properties: { name: str({ example: 'Black' }), hex: str({ example: '#111111' }) },
      },
      stock: int({ default: 0 }),
      price: int({ nullable: true, description: 'Overrides the product price' }),
      lowStockThreshold: int({ default: 5 }),
      isActive: { type: 'boolean', default: true },
    },
  },
  CreateProductRequest: {
    type: 'object',
    required: ['name', 'description', 'brand', 'category', 'gender', 'price'],
    properties: {
      name: str(),
      description: str(),
      brand: str({ description: 'Brand id' }),
      category: str({ description: 'Category id' }),
      gender: str({ enum: ['men', 'women', 'unisex', 'boys', 'girls', 'kids'] }),
      fabric: str(),
      tags: { type: 'array', items: str() },
      images: {
        type: 'array',
        items: { type: 'object', properties: { url: str(), publicId: str(), alt: str() } },
      },
      price: int({ example: 2490, description: 'Whole PKR rupees' }),
      compareAtPrice: int({ nullable: true, description: 'Must be higher than price' }),
      status: str({ enum: ['draft', 'active', 'archived'], default: 'draft' }),
      variants: { type: 'array', items: ref('CreateVariantRequest') },
    },
  },
  AdjustStockRequest: {
    type: 'object',
    description: 'Provide exactly one of `delta` or `set`.',
    properties: {
      delta: int({ example: -2 }),
      set: int({ example: 25 }),
      reason: str({
        enum: ['initial', 'restock', 'adjustment', 'correction', 'damage', 'return', 'sale'],
      }),
      note: str(),
    },
  },
};
