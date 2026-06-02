import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://vidgrab:vidgrab@localhost:5432/vidgrab",
  },
  strict: true,
  verbose: true,
});
