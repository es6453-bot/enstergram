import { createHash } from "node:crypto";
import { database } from "./database";
import { limitAuthRequest } from "./auth-store";

export const emailReady = () =>
  !!(process.env.AUTH_RESEND_KEY && process.env.AUTH_EMAIL_FROM);
export const googleReady = () =>
  !!(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);
export const tokenHash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export async function sendSignInEmail(
  email: string,
  url: string,
  linking = false,
) {
  if (!emailReady()) throw new Error("Email sign-in is not configured yet.");
  await limitAuthRequest(database(), `email:${tokenHash(email)}`);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.AUTH_RESEND_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.AUTH_EMAIL_FROM,
      to: [email],
      subject: linking
        ? "Link your email to Estergram"
        : "Your Estergram sign-in link",
      text: `${linking ? "Confirm this email for your current Estergram account" : "Continue to Estergram"}:\n\n${url}\n\nThis link expires in 15 minutes and works once. ${linking ? "Open it in the same browser where you requested it." : "If you didn’t request it, ignore this email."}`,
    }),
  });
  if (!response.ok)
    throw new Error("We couldn’t send your link. Please try again later.");
}
