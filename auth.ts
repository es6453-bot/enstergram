import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import Resend from "next-auth/providers/resend";
import { decode } from "next-auth/jwt";
import { database } from "./lib/database";
import { authStore, normalizeEmail, limitAuthRequest } from "./lib/auth-store";
import { githubSubject, isAllowedPlayer } from "./lib/identity-policy";
import {
  emailReady,
  googleReady,
  sendSignInEmail,
  tokenHash,
} from "./lib/email";

const lazyDatabase = {
  prepare(sql: string) {
    return database().prepare(sql);
  },
  batch(statements: Parameters<ReturnType<typeof database>["batch"]>[0]) {
    return database().batch(statements);
  },
};
export const { handlers, auth, signIn, signOut } = NextAuth((request) => {
  let verifiedGoogleEmail: string | undefined;
  return {
    adapter: authStore(lazyDatabase, {
      googleEmail: () => verifiedGoogleEmail,
    }),
    providers: [
      ...(googleReady()
        ? [
            Google({
              authorization: {
                params: {
                  scope: "openid email profile",
                  prompt: "select_account",
                },
              },
            }),
          ]
        : []),
      ...(emailReady()
        ? [
            Resend({
              id: "email",
              name: "Email",
              apiKey: process.env.AUTH_RESEND_KEY,
              from: process.env.AUTH_EMAIL_FROM,
              maxAge: 15 * 60,
              normalizeIdentifier: normalizeEmail,
              sendVerificationRequest: ({ identifier, url }) =>
                sendSignInEmail(identifier, url),
            }),
          ]
        : []),
      GitHub({
        profile(profile) {
          return {
            id: String(profile.id),
            name: profile.name || profile.login,
            email: null,
            image: null,
          };
        },
      }),
    ],
    session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
    jwt: {
      async decode(params) {
        const token = await decode(params);
        // Upgrade existing GitHub cookies to canonical profile IDs before account linking.
        if (token?.githubId && !token.playerId) {
          const linked = await database()
            .prepare(
              "SELECT user_id FROM auth_identities WHERE provider='github' AND subject=?",
            )
            .bind(String(token.githubId))
            .first();
          if (linked) {
            token.sub = linked.user_id;
            token.playerId = linked.user_id;
          }
        }
        return token;
      },
    },
    pages: {
      signIn: "/signin",
      error: "/signin",
      verifyRequest: "/signin/check-email",
      newUser: "/onboarding",
    },
    callbacks: {
      async signIn({ account, profile, email }) {
        if (account?.provider === "github")
          return (
            githubSubject(profile?.id) ===
              githubSubject(account.providerAccountId) &&
            isAllowedPlayer(profile?.id)
          );
        if (account?.provider === "google") {
          const verified =
            profile?.email_verified === true &&
            typeof profile?.sub === "string" &&
            profile.sub === account.providerAccountId;
          if (verified && typeof profile?.email === "string")
            verifiedGoogleEmail = normalizeEmail(profile.email);
          return verified && !!verifiedGoogleEmail;
        }
        if (account?.provider === "email") {
          if (email?.verificationRequest) {
            const ip =
              request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
              "unknown";
            await limitAuthRequest(database(), `email-ip:${tokenHash(ip)}`, 20);
          }
          return true;
        }
        return false;
      },
      async jwt({ token, user }) {
        if (user?.id) {
          token.playerId = user.id;
          token.sub = user.id;
          delete token.githubId;
        }
        return token;
      },
      async session({ session, token }) {
        if (typeof token.playerId === "string")
          session.user.id = token.playerId;
        return session;
      },
    },
    logger: {
      error(error) {
        console.error("Sign-in failed:", "type" in error ? error.type : error.name);
      },
      warn(code) {
        console.warn("Auth:", code);
      },
    },
  };
});
