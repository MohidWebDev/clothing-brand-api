import { type IRole, Role, type RoleDocument } from '../models';

export const roleRepository = {
  findByName: (name: string): Promise<RoleDocument | null> => Role.findOne({ name }),

  findById: (id: string): Promise<RoleDocument | null> => Role.findById(id),

  list: (): Promise<RoleDocument[]> => Role.find().sort({ name: 1 }),

  /** Inserts the role if missing. With `overwritePermissions`, also resets its permissions. */
  upsertSystemRole: (
    role: Pick<IRole, 'name' | 'displayName' | 'permissions'>,
    overwritePermissions = false,
  ) =>
    Role.findOneAndUpdate(
      { name: role.name },
      {
        $set: { displayName: role.displayName, isSystem: true },
        ...(overwritePermissions
          ? {
              $set: {
                displayName: role.displayName,
                isSystem: true,
                permissions: role.permissions,
              },
            }
          : { $setOnInsert: { permissions: role.permissions } }),
      },
      { upsert: true, new: true },
    ),
};
