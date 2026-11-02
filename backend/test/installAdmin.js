import { mock } from "node:test";
import { env } from "../config/env.js";
import Admin from "../models/Admin.js";

// Authenticated tests do not connect to MongoDB. This stands in for the admins collection.
export function installAdmin() {
  const admin = {
    email: env.AUTH_EMAIL.toLowerCase(),
    name: env.AUTH_EMAIL.split("@")[0],
    role: "admin",
    passwordHash: env.AUTH_PASSWORD_HASH,
  };
  mock.method(Admin, "findOne", (filter = {}) => {
    const email = String(filter.email || "").toLowerCase();
    const doc = email === admin.email ? admin : null;
    const query = Promise.resolve(doc);
    query.select = () => query;
    return query;
  });
}
