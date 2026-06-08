import "./globals.css";

import type { Metadata } from "next";
import { DM_Sans } from "next/font/google";
import { cookies } from "next/headers";

import { ClarityScript } from "./components/ClarityScript";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "funnel builder",
  description: "Your personal funnel",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const userId = cookieStore.get("userId")?.value;

  return (
    <html lang="en" className={`${dmSans.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <ClarityScript userData={userId ? { userId } : undefined} />
        {children}
      </body>
    </html>
  );
}
