import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { passkey } from "@better-auth/passkey";
import { nextCookies } from "better-auth/next-js";
import { db } from "./db";
import { env } from "./env";

export const auth = betterAuth({
  appName: "RSS Reader",
  database: drizzleAdapter(db, { provider: "pg" }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    requireEmailVerification: false,
    // Mock email handlers for now — swap with Resend in production.
    sendResetPassword: async ({ user, url }) => {
      console.log(`[auth] password reset for ${user.email}: ${url}`);
    },
  },
  emailVerification: {
    sendOnSignUp: false,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      console.log(`[auth] verify email for ${user.email}: ${url}`);
    },
  },
  plugins: [
    passkey({
      rpID: env.PASSKEY_RP_ID,
      rpName: env.PASSKEY_RP_NAME ?? "RSS Reader",
      origin: env.PASSKEY_ORIGIN,
    }),
    nextCookies(),
  ],
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
  },
  trustedOrigins: env.TRUSTED_ORIGINS?.split(",").map((o) => o.trim()).filter(Boolean),
});

export type Session = typeof auth.$Infer.Session;
