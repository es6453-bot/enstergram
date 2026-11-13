import type { Metadata } from "next";
import "./globals.css";
import "./social.css";

export const metadata: Metadata = {
  title: "Enstergram — Your 10 words of fame.",
  applicationName: "Enstergram",
  description:
    "Enstergram. Earn Likes, equip your next big idea at The Algorithm™, and join the daily writing competition.",
  icons: {
    icon: { url: "/enstergram-icon.png", type: "image/png", sizes: "64x64" },
    apple: { url: "/enstergram-touch-icon.png", sizes: "180x180" },
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
