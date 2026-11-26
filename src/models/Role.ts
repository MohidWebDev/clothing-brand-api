import { type HydratedDocument, Schema, model } from 'mongoose';
import type { Permission } from '../constants';

export interface IRole {
  name: string;
  displayName: string;
  permissions: Permission[];
  /** System roles (customer, staff, ...) cannot be deleted or renamed. */
  isSystem: boolean;
}

export type RoleDocument = HydratedDocument<IRole>;

const roleSchema = new Schema<IRole>(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      match: /^[a-z][a-z_]*$/,
    },
    displayName: { type: String, required: true, trim: true },
    permissions: { type: [String], default: [] },
    isSystem: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export const Role = model<IRole>('Role', roleSchema);
