import type { Metadata } from "next";
import { Cormorant_Garamond, Libre_Baskerville, Caveat } from "next/font/google";
import { GuestProvider } from "@/lib/guest-context";
import { ProfileProvider } from "@/lib/profile-context";
import "./globals.css";

const cormorantGaramond = Cormorant_Garamond({
  variable: "--font-cormorant",
  style: ["normal", "italic"],
  weight: ["400", "600", "700"],
  subsets: ["latin"],
});

const libreBaskerville = Libre_Baskerville({
  variable: "--font-serif",
  weight: ["400", "700"],
  subsets: ["latin"],
});

const caveat = Caveat({
  variable: "--font-caveat",
  weight: ["400", "600"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CareBridge AI",
  description: "Private, multilingual caregiver support for navigating care, coverage, and next steps.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${cormorantGaramond.variable} ${libreBaskerville.variable} ${caveat.variable}`}>
      <body className="font-serif antialiased">
        <GuestProvider>
          <ProfileProvider>{children}</ProfileProvider>
        </GuestProvider>
      </body>
    </html>
  );
}
