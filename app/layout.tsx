import type { Metadata } from "next";
import "./globals.css";
import "./social.css";

export const metadata: Metadata = {
  title: "Estergram — Your 10 words of fame.",
  description:
    "Estergram. Earn Likes, equip your next big idea at The Algorithm™, and join the daily writing competition.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
