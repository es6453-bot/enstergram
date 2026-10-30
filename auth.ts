import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import { githubSubject, isAllowedPlayer } from "./lib/identity-policy";
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [GitHub],
  session: { strategy: "jwt", maxAge: 7 * 24 * 60 * 60 },
  pages: { signIn: "/signin", error: "/signin" },
  callbacks: {
    async signIn({ account, profile }) {
      return (
        account?.provider === "github" &&
        githubSubject(profile?.id) ===
          githubSubject(account.providerAccountId) &&
        isAllowedPlayer(profile?.id)
      );
    },
    async jwt({ token, account, profile }) {
      if (account?.provider === "github") {
        const subject = githubSubject(profile?.id);
        if (!subject) return null;
        token.githubId = subject;
      }
      return token;
    },
    async session({ session, token }) {
      const subject = githubSubject(token.githubId);
      if (subject) session.user.id = `github:${subject}`;
      return session;
    },
  },
});
