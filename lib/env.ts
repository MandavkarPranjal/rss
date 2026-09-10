import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z.url(),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url().optional(),
    PASSKEY_RP_ID: z.string().min(1).optional(),
    PASSKEY_RP_NAME: z.string().min(1).optional(),
    PASSKEY_ORIGIN: z.url().optional(),
    TRUSTED_ORIGINS: z.string().min(1).optional(),
    CRON_SECRET: z.string().min(1).optional(),
    GITHUB_CLIENT_ID: z.string().min(1).optional(),
    GITHUB_CLIENT_SECRET: z.string().min(1).optional(),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
  },

  client: {
    // NEXT_PUBLIC_APP_URL: z.url().optional(),
  },

  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
    PASSKEY_RP_ID: process.env.PASSKEY_RP_ID,
    PASSKEY_RP_NAME: process.env.PASSKEY_RP_NAME,
    PASSKEY_ORIGIN: process.env.PASSKEY_ORIGIN,
    TRUSTED_ORIGINS: process.env.TRUSTED_ORIGINS,
    CRON_SECRET: process.env.CRON_SECRET,
    GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID,
    GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET,
    NODE_ENV: process.env.NODE_ENV,
    // NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  },

  emptyStringAsUndefined: true,
  // Skip validation during Docker builds / CI where env isn't available yet:
  // `SKIP_ENV_VALIDATION=1 bun run build`
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});
