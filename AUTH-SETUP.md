# Google, email and guest onboarding

Estergram keeps Auth.js, Turso/libSQL, existing player IDs, GitHub identities and game data. Supabase is not used. Google and email controls say “coming soon” until configured. GitHub and guest preview work independently of their configuration.

## Google: manual setup

1. Open [Google Cloud Console](https://console.cloud.google.com/), create/select your project, and configure Google Auth Platform branding, audience and contact information for **Estergram**. Request only `openid`, `email`, and `profile`. While testing, add your test accounts. Publish the audience when ready for other players, completing any verification Google requests.
2. Create an OAuth client of type **Web application**. Set the authorized JavaScript origin to `https://estergram.vercel.app` and the redirect URI to exactly:

   ```text
   https://estergram.vercel.app/api/auth/callback/google
   ```

3. In [Vercel environment settings](https://vercel.com/enstergram/estergram/settings/environment-variables), add `AUTH_GOOGLE_ID` (client ID) and `AUTH_GOOGLE_SECRET` (client secret) to **Production**. Save credentials as sensitive values. Keep all existing GitHub, Turso and session variables.
4. Redeploy the latest source. Google becomes enabled automatically when both variables exist.

Use a separate OAuth client/database for local or preview work. The local callback is `http://localhost:3000/api/auth/callback/google`; register the exact origin/port used. Update registered callbacks and `AUTH_URL` when adding a custom domain.

## Email: manual setup

Email uses Auth.js magic links and Resend's HTTP delivery API. No email service account, subscription or paid resource was created by this source update.

1. Create/sign into [Resend](https://resend.com/). Add a sending domain you own and verify the DNS records Resend supplies. The shared `vercel.app` domain is not yours to verify; use your own domain/subdomain. Resend's development sender has recipient restrictions and is not a production sender for players.
2. Create an API key permitted to send from your domain. Add these **Production** environment variables in Vercel:

   | Variable | Value |
   | --- | --- |
   | `AUTH_RESEND_KEY` | Your Resend API key |
   | `AUTH_EMAIL_FROM` | `Estergram <sign-in@YOUR-VERIFIED-DOMAIN>` |
   | `AUTH_URL` | `https://estergram.vercel.app` |

3. Redeploy. Email enables when the key and sender are present. `AUTH_URL` is required for account-settings email linking. Keep `AUTH_SECRET` unchanged to preserve existing sessions.
4. Test delivery, spam placement and sender identity. Links expire after 15 minutes and work once. Sending mail creates no player account until the link is verified. Requests have persistent per-address limits; login also has a per-IP limit. Check your provider's current quotas before opening registration broadly.

Never paste secrets into chat or commit them. Store local secrets in ignored `.env.local` and production secrets in Vercel. Give preview environments separate credentials and databases.

## Existing accounts and safe linking

- Existing players first use their current GitHub sign-in, then open **Account settings** (`/account`) to **Link Google** or **Send confirmation link**. Their player ID, name, Likes, followers, inventory, scores and owner privileges are retained. Existing players skip onboarding and receive a unique generated handle they can edit later.
- Google identities require a verified email. Google email claims and identity linking commit together. Email linking requires the matching signed-in player, a one-use link in that browser, and an explicit confirmation. OAuth access/refresh tokens are not stored.
- Unique provider subjects cannot move between players. An email claimed by another profile blocks linking. Names and unverified email addresses never authorize merging.
- Google followed by email verification uses the same profile for the same normalized email. Email followed by Google asks the player to sign into the existing account and link Google; it refuses a silent merge or duplicate profile.
- **Different email addresses cannot establish that accounts belong to the same person.** Explicitly link methods before using a different one. Legacy GitHub profiles did not store email addresses, so this instruction matters especially for existing players. Automatic merging of separately created profiles is unsupported.
- `OWNER_GITHUB_ID` remains the only source of owner privileges. Linked methods retain the owner's original profile. New Google/email players receive regular player access. `ALLOWED_GITHUB_IDS` controls GitHub only; configuring Google/email intentionally allows registration through those verified methods.

## Guest, onboarding and sessions

- `/guest` exposes published prompts, finalized completed results and a browser-local practice composer. It creates no profile, wallet, official response, receipt or reward and performs no database writes/finalization.
- Draft/future prompts, live responses, ballots, unfinished results and authentication data are excluded from the public projection. Official APIs require a permanent account and completed onboarding; guests cannot submit, vote, purchase, activate or earn progression.
- A practice draft carries into the signed-in composer only for the same currently open round and when there is no saved official response. It still needs explicit submission and normal server validation.
- New players choose a case-insensitively unique 3–24 character username or accept a generated one. A database index resolves concurrent claims. Decoration is optional later.
- Returning players go to `/submit`. Auth.js uses encrypted HttpOnly cookies, Secure in production, with a 30-day maximum lifetime. Legacy GitHub cookies resolve to the original player ID. Normal expiry and sign-out still apply.
- Public names/handles never enter anonymous voting cards. Finalized results retain the existing profile reveal behavior.

## Rollout and checks

`0009_frictionless_auth.sql` is additive and applied by the normal checksum-tracked deployment build. It does not modify existing profiles, balances, inventories, ledgers, results or authentication identities. It adds metadata/handles and marks existing players onboarded. Do not edit applied migrations.

1. Run `pnpm test`, `pnpm typecheck`, `pnpm lint` and `pnpm build`. Deploy and check `/api/health`.
2. Check an old GitHub session, the owner's role and unchanged balance. Browse `/guest` signed out and try practice. Official endpoints must still reject anonymous writes and forged identity headers.
3. After provider setup, test real Google and email sign-in with new accounts, username choice, and returning sessions.
4. From an existing GitHub profile, link Google/email and verify every method reaches the same ID without another welcome grant. Test occupied identities/usernames and replaying expired/used links.

Automated tests exercise an actual Auth.js magic-link callback with simulated delivery and an isolated database, token expiry/replay, identity conflicts, username concurrency, migration preservation and guest privacy. Real Google OAuth consent and production mail delivery require the owner-completed external configuration above.

References: [Auth.js Google](https://authjs.dev/getting-started/providers/google), [Auth.js Resend](https://authjs.dev/getting-started/providers/resend), [Resend verified domains](https://resend.com/docs/dashboard/domains/introduction).
