import { env } from "../config/env.js";
import Admin from "../models/Admin.js";

export const publicAdmin = (admin) => ({ email: admin.email, name: admin.name, role: admin.role });

// The env values only create the first admin. Later sign-in uses this record.
export async function ensureAdmin() {
  if (await Admin.exists({})) return;
  const email = env.AUTH_EMAIL.toLowerCase();
  await Admin.create({
    email,
    name: email.split("@")[0],
    passwordHash: env.AUTH_PASSWORD_HASH,
    role: "admin",
  });
}
