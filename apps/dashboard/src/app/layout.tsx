import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Aimpire Command Center",
  description: "Read-only management dashboard for Aimpire.",
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="bg-zinc-950">
      <body className="min-h-screen bg-zinc-950 text-zinc-100 antialiased">{children}</body>
    </html>
  );
}
