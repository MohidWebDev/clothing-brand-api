import type { IImage } from '../models';
import { imageStorage } from './storage.service';

/**
 * Deletes stored files that were removed from an entity. Runs after the database update has
 * succeeded and never throws, so a storage hiccup cannot fail the request.
 */
export async function deleteRemovedImages(
  before: readonly IImage[],
  after: readonly IImage[],
): Promise<void> {
  const kept = new Set(after.map((i) => i.publicId).filter(Boolean));
  const removed = before.map((i) => i.publicId).filter((id): id is string => !!id && !kept.has(id));
  await Promise.all(removed.map((id) => imageStorage.delete(id)));
}
