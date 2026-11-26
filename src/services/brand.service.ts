import { brandRepository } from '../repositories/brand.repository';
import { productRepository } from '../repositories/product.repository';
import { ApiError } from '../utils/ApiError';
import { uniqueSlug } from '../utils/slug';
import type { CreateBrandBody, UpdateBrandBody } from '../validators/catalog.validators';
import { toBrand } from './catalogMapper';
import { deleteRemovedImages } from './imageCleanup';

const duplicateName = () =>
  ApiError.conflict('A brand with this name already exists', [
    { location: 'body', path: 'name', message: 'Already in use' },
  ]);

export const brandService = {
  listPublic: async () => (await brandRepository.list(true)).map(toBrand),

  listAdmin: async () => (await brandRepository.list(false)).map(toBrand),

  async create(input: CreateBrandBody) {
    if (await brandRepository.findByName(input.name)) throw duplicateName();

    const brand = await brandRepository.create({
      ...input,
      slug: await uniqueSlug(input.name, brandRepository.slugExists),
    });
    return toBrand(brand);
  },

  async update(id: string, input: UpdateBrandBody) {
    const brand = await brandRepository.findById(id);
    if (!brand) throw ApiError.notFound('Brand not found');

    if (input.name && (await brandRepository.findByName(input.name, id))) throw duplicateName();

    const previousLogo = brand.logo ? [brand.logo] : [];

    // The slug is kept on rename so existing links keep working.
    if (input.name !== undefined) brand.name = input.name;
    if (input.isActive !== undefined) brand.isActive = input.isActive;
    if (input.description !== undefined) brand.description = input.description ?? undefined;
    if (input.logo !== undefined) brand.logo = input.logo ?? undefined;
    await brand.save();

    await deleteRemovedImages(previousLogo, brand.logo ? [brand.logo] : []);
    return toBrand(brand);
  },

  async remove(id: string) {
    const brand = await brandRepository.findById(id);
    if (!brand) throw ApiError.notFound('Brand not found');

    const products = await productRepository.countByBrand(id);
    if (products > 0) {
      throw ApiError.conflict(
        `This brand is used by ${products} product${products === 1 ? '' : 's'}. Reassign or archive them first.`,
      );
    }
    await brandRepository.softDelete(id);
  },
};
