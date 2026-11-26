import { PRODUCT_STATUS } from '../constants';
import { logger } from '../config/logger';
import { Brand, Category, Product } from '../models';
import { slugify } from '../utils/slug';

/** Small deterministic PRNG so every run produces the same demo catalogue. */
function prng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const placeholder = (text: string, w = 800, h = 1000) =>
  `https://placehold.co/${w}x${h}/png?text=${encodeURIComponent(text)}`;

const COLORS = [
  { name: 'Black', hex: '#111111', code: 'BLK' },
  { name: 'White', hex: '#F5F5F5', code: 'WHT' },
  { name: 'Navy', hex: '#1F2A44', code: 'NVY' },
  { name: 'Olive', hex: '#6B7A3A', code: 'OLV' },
  { name: 'Maroon', hex: '#7A1F2B', code: 'MRN' },
  { name: 'Sky Blue', hex: '#8EC5E8', code: 'SKY' },
  { name: 'Beige', hex: '#D8C3A5', code: 'BGE' },
  { name: 'Mustard', hex: '#D9A520', code: 'MST' },
];

const LETTER_SIZES = ['S', 'M', 'L', 'XL'];
const WAIST_SIZES = ['30', '32', '34', '36'];
const KIDS_SIZES = ['2-3Y', '4-5Y', '6-7Y', '8-9Y'];
const ONE_SIZE = ['UNSTITCHED'];

const BRANDS = [
  { name: 'Urban Thread', code: 'UT', description: 'Everyday essentials, cut for the city.' },
  { name: 'Heritage Loom', code: 'HL', description: 'Traditional craft, modern fits.' },
  { name: 'Indus Denim', code: 'ID', description: 'Durable denim and trousers.' },
  { name: 'Little Steps', code: 'LS', description: 'Comfortable, playful kidswear.' },
];

type CategorySeed = { name: string; children?: string[] };
const CATEGORIES: CategorySeed[] = [
  { name: 'Men', children: ['T-Shirts', 'Shirts', 'Jeans & Trousers', 'Kurtas'] },
  { name: 'Women', children: ['Kurtas', 'Dresses', 'Tops', 'Lawn Suits'] },
  { name: 'Kids', children: ['Boys', 'Girls'] },
];

interface ProductSeed {
  name: string;
  category: string; // "Parent/Child"
  brand: string;
  gender: 'men' | 'women' | 'boys' | 'girls' | 'unisex';
  fabric: string;
  price: number;
  compareAtPrice?: number;
  sizes: string[];
  colors: number;
  tags: string[];
}

const PRODUCTS: ProductSeed[] = [
  {
    name: 'Classic Crew Neck T-Shirt',
    category: 'Men/T-Shirts',
    brand: 'Urban Thread',
    gender: 'men',
    fabric: 'Cotton',
    price: 1490,
    sizes: LETTER_SIZES,
    colors: 5,
    tags: ['basics', 'casual'],
  },
  {
    name: 'Graphic Print T-Shirt',
    category: 'Men/T-Shirts',
    brand: 'Urban Thread',
    gender: 'men',
    fabric: 'Cotton',
    price: 1790,
    compareAtPrice: 2290,
    sizes: LETTER_SIZES,
    colors: 3,
    tags: ['graphic', 'casual'],
  },
  {
    name: 'Polo Shirt',
    category: 'Men/T-Shirts',
    brand: 'Urban Thread',
    gender: 'men',
    fabric: 'Cotton Pique',
    price: 2490,
    sizes: LETTER_SIZES,
    colors: 4,
    tags: ['polo', 'smart casual'],
  },
  {
    name: 'Oxford Button-Down Shirt',
    category: 'Men/Shirts',
    brand: 'Urban Thread',
    gender: 'men',
    fabric: 'Oxford Cotton',
    price: 3290,
    sizes: LETTER_SIZES,
    colors: 3,
    tags: ['formal', 'office'],
  },
  {
    name: 'Linen Casual Shirt',
    category: 'Men/Shirts',
    brand: 'Heritage Loom',
    gender: 'men',
    fabric: 'Linen Blend',
    price: 3490,
    compareAtPrice: 4290,
    sizes: LETTER_SIZES,
    colors: 4,
    tags: ['summer', 'linen'],
  },
  {
    name: 'Slim Fit Jeans',
    category: 'Men/Jeans & Trousers',
    brand: 'Indus Denim',
    gender: 'men',
    fabric: 'Stretch Denim',
    price: 4290,
    sizes: WAIST_SIZES,
    colors: 3,
    tags: ['denim', 'slim'],
  },
  {
    name: 'Straight Fit Jeans',
    category: 'Men/Jeans & Trousers',
    brand: 'Indus Denim',
    gender: 'men',
    fabric: 'Denim',
    price: 3990,
    sizes: WAIST_SIZES,
    colors: 2,
    tags: ['denim', 'classic'],
  },
  {
    name: 'Chino Trousers',
    category: 'Men/Jeans & Trousers',
    brand: 'Indus Denim',
    gender: 'men',
    fabric: 'Cotton Twill',
    price: 3790,
    sizes: WAIST_SIZES,
    colors: 4,
    tags: ['chino', 'smart casual'],
  },
  {
    name: 'Embroidered Kurta',
    category: 'Men/Kurtas',
    brand: 'Heritage Loom',
    gender: 'men',
    fabric: 'Cotton',
    price: 5490,
    sizes: LETTER_SIZES,
    colors: 4,
    tags: ['eid', 'festive', 'embroidered'],
  },
  {
    name: 'Plain Cotton Kurta',
    category: 'Men/Kurtas',
    brand: 'Heritage Loom',
    gender: 'men',
    fabric: 'Cotton',
    price: 3290,
    compareAtPrice: 3990,
    sizes: LETTER_SIZES,
    colors: 5,
    tags: ['everyday', 'kurta'],
  },
  {
    name: 'Wash & Wear Kurta',
    category: 'Men/Kurtas',
    brand: 'Heritage Loom',
    gender: 'men',
    fabric: 'Wash & Wear',
    price: 4190,
    sizes: LETTER_SIZES,
    colors: 3,
    tags: ['formal', 'kurta'],
  },
  {
    name: 'Printed Lawn Kurta',
    category: 'Women/Kurtas',
    brand: 'Heritage Loom',
    gender: 'women',
    fabric: 'Lawn',
    price: 3990,
    sizes: LETTER_SIZES,
    colors: 4,
    tags: ['lawn', 'summer', 'printed'],
  },
  {
    name: 'Embroidered Chiffon Kurta',
    category: 'Women/Kurtas',
    brand: 'Heritage Loom',
    gender: 'women',
    fabric: 'Chiffon',
    price: 6990,
    compareAtPrice: 8490,
    sizes: LETTER_SIZES,
    colors: 3,
    tags: ['festive', 'embroidered'],
  },
  {
    name: 'Straight Cut Cotton Kurta',
    category: 'Women/Kurtas',
    brand: 'Urban Thread',
    gender: 'women',
    fabric: 'Cotton',
    price: 2790,
    sizes: LETTER_SIZES,
    colors: 5,
    tags: ['everyday', 'kurta'],
  },
  {
    name: 'Floral Midi Dress',
    category: 'Women/Dresses',
    brand: 'Urban Thread',
    gender: 'women',
    fabric: 'Viscose',
    price: 4990,
    sizes: LETTER_SIZES,
    colors: 3,
    tags: ['dress', 'floral', 'summer'],
  },
  {
    name: 'Wrap Maxi Dress',
    category: 'Women/Dresses',
    brand: 'Urban Thread',
    gender: 'women',
    fabric: 'Crepe',
    price: 5790,
    sizes: LETTER_SIZES,
    colors: 3,
    tags: ['dress', 'party'],
  },
  {
    name: 'Ribbed Knit Top',
    category: 'Women/Tops',
    brand: 'Urban Thread',
    gender: 'women',
    fabric: 'Cotton Knit',
    price: 1990,
    sizes: LETTER_SIZES,
    colors: 5,
    tags: ['basics', 'knit'],
  },
  {
    name: 'Satin Blouse',
    category: 'Women/Tops',
    brand: 'Urban Thread',
    gender: 'women',
    fabric: 'Satin',
    price: 2990,
    compareAtPrice: 3690,
    sizes: LETTER_SIZES,
    colors: 4,
    tags: ['blouse', 'office'],
  },
  {
    name: '3-Piece Printed Lawn Suit',
    category: 'Women/Lawn Suits',
    brand: 'Heritage Loom',
    gender: 'women',
    fabric: 'Lawn',
    price: 7990,
    sizes: ONE_SIZE,
    colors: 4,
    tags: ['lawn', 'unstitched', 'summer'],
  },
  {
    name: '3-Piece Embroidered Lawn Suit',
    category: 'Women/Lawn Suits',
    brand: 'Heritage Loom',
    gender: 'women',
    fabric: 'Lawn',
    price: 9990,
    compareAtPrice: 12490,
    sizes: ONE_SIZE,
    colors: 3,
    tags: ['lawn', 'embroidered', 'unstitched'],
  },
  {
    name: '2-Piece Cotton Suit',
    category: 'Women/Lawn Suits',
    brand: 'Heritage Loom',
    gender: 'women',
    fabric: 'Cotton',
    price: 5490,
    sizes: ONE_SIZE,
    colors: 4,
    tags: ['cotton', 'unstitched'],
  },
  {
    name: 'Boys Cotton T-Shirt',
    category: 'Kids/Boys',
    brand: 'Little Steps',
    gender: 'boys',
    fabric: 'Cotton',
    price: 990,
    sizes: KIDS_SIZES,
    colors: 5,
    tags: ['kids', 'basics'],
  },
  {
    name: 'Boys Denim Shorts',
    category: 'Kids/Boys',
    brand: 'Little Steps',
    gender: 'boys',
    fabric: 'Denim',
    price: 1690,
    sizes: KIDS_SIZES,
    colors: 2,
    tags: ['kids', 'summer'],
  },
  {
    name: 'Boys Kurta Shalwar Set',
    category: 'Kids/Boys',
    brand: 'Little Steps',
    gender: 'boys',
    fabric: 'Cotton',
    price: 2990,
    compareAtPrice: 3590,
    sizes: KIDS_SIZES,
    colors: 4,
    tags: ['kids', 'eid', 'festive'],
  },
  {
    name: 'Girls Frock',
    category: 'Kids/Girls',
    brand: 'Little Steps',
    gender: 'girls',
    fabric: 'Cotton',
    price: 2290,
    sizes: KIDS_SIZES,
    colors: 4,
    tags: ['kids', 'frock'],
  },
  {
    name: 'Girls Printed Kurta',
    category: 'Kids/Girls',
    brand: 'Little Steps',
    gender: 'girls',
    fabric: 'Lawn',
    price: 1890,
    sizes: KIDS_SIZES,
    colors: 4,
    tags: ['kids', 'printed'],
  },
  {
    name: 'Girls Party Dress',
    category: 'Kids/Girls',
    brand: 'Little Steps',
    gender: 'girls',
    fabric: 'Net',
    price: 3490,
    compareAtPrice: 4290,
    sizes: KIDS_SIZES,
    colors: 3,
    tags: ['kids', 'party', 'festive'],
  },
];

/** Creates brands, categories and demo products. Safe to run repeatedly: existing rows are kept. */
export async function seedCatalog() {
  const brandCodes = new Map<string, string>();
  const brandIds = new Map<string, import('mongoose').Types.ObjectId>();
  for (const b of BRANDS) {
    const slug = slugify(b.name);
    const brand =
      (await Brand.findOne({ slug })) ??
      (await Brand.create({
        name: b.name,
        slug,
        description: b.description,
        logo: { url: placeholder(b.name, 400, 400) },
      }));
    brandIds.set(b.name, brand._id);
    brandCodes.set(b.name, b.code);
  }

  const categoryIds = new Map<string, import('mongoose').Types.ObjectId>();
  for (const [i, parent] of CATEGORIES.entries()) {
    const parentSlug = slugify(parent.name);
    const parentDoc =
      (await Category.findOne({ slug: parentSlug })) ??
      (await Category.create({ name: parent.name, slug: parentSlug, sortOrder: i }));
    categoryIds.set(parent.name, parentDoc._id);

    for (const [j, childName] of (parent.children ?? []).entries()) {
      const slug = slugify(`${parent.name} ${childName}`);
      const child =
        (await Category.findOne({ slug })) ??
        (await Category.create({
          name: childName,
          slug,
          parent: parentDoc._id,
          sortOrder: j,
        }));
      categoryIds.set(`${parent.name}/${childName}`, child._id);
    }
  }

  const random = prng(2026);
  let created = 0;

  for (const [index, p] of PRODUCTS.entries()) {
    const slug = slugify(p.name);
    if (await Product.exists({ slug })) continue;

    const colors = COLORS.slice(0, p.colors);
    const code = String(index + 1).padStart(3, '0');
    const brandCode = brandCodes.get(p.brand)!;

    const variants = colors.flatMap((color) =>
      p.sizes.map((size) => ({
        sku: `${brandCode}-${code}-${color.code}-${size.replace(/\s/g, '')}`,
        size,
        color: { name: color.name, hex: color.hex },
        colorKey: color.name.toLowerCase(),
        // A mix of healthy, low and sold-out stock so every UI state can be exercised.
        stock:
          random() < 0.12
            ? 0
            : random() < 0.2
              ? Math.floor(random() * 4) + 1
              : Math.floor(random() * 40) + 10,
        lowStockThreshold: 5,
        images: [{ url: placeholder(`${p.name} - ${color.name}`) }],
        isActive: true,
      })),
    );

    await Product.create({
      name: p.name,
      slug,
      description:
        `${p.name} by ${p.brand}. Made from ${p.fabric.toLowerCase()} for all-day comfort. ` +
        'Machine washable. Available in several colors and sizes.',
      brand: brandIds.get(p.brand),
      category: categoryIds.get(p.category),
      gender: p.gender,
      fabric: p.fabric,
      tags: p.tags,
      images: [
        { url: placeholder(p.name), alt: p.name },
        { url: placeholder(`${p.name} (back)`), alt: `${p.name}, back view` },
      ],
      price: p.price,
      compareAtPrice: p.compareAtPrice,
      status: PRODUCT_STATUS.ACTIVE,
      variants,
      soldCount: Math.floor(random() * 300),
      ratingAverage: Math.round((3.5 + random() * 1.5) * 10) / 10,
      ratingCount: Math.floor(random() * 120),
    });
    created++;
  }

  logger.info(
    `Catalog seeded: ${BRANDS.length} brands, ${categoryIds.size} categories, ${created} new products`,
  );
}
