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
    enabled: false,
  },
  emailVerification: {
    sendOnSignUp: false,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      console.log(`[auth] verify email for ${user.email}: ${url}`);
    },
  },
  socialProviders: {
    ...(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET
      ? {
          github: {
            clientId: env.GITHUB_CLIENT_ID,
            clientSecret: env.GITHUB_CLIENT_SECRET,
          },
        }
      : {}),
  },
  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ["github"],
      // Existing password accounts never verified email (verification was
      // disabled), so don't block GitHub auto-link on local emailVerified.
      // GitHub verifies emails itself.
      requireLocalEmailVerified: false,
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
  user: {
    changeEmail: {
      enabled: true,
      updateEmailWithoutVerification: true,
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    // Avoid a DB hit on every GET (requireUser -> getSession): the session is
    // served from the signed cookie for 5 minutes, then revalidated from the
    // database on expiry. `refreshCache` stays off on purpose — Better Auth
    // disables it for stateful (database) setups. Reads accept the resulting
    // 5-minute revocation window; mutations bypass the cache (see requireUser).
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60,
    },
  },
  trustedOrigins: env.TRUSTED_ORIGINS?.split(",").map((o) => o.trim()).filter(Boolean),
});

export type Session = typeof auth.$Infer.Session;
