import type { Metadata } from "next";
import { Inter, IBM_Plex_Mono } from "next/font/google";
import "../styles/globals.css";
import { Providers } from "@/components/Providers";
import { AppNav } from "@/components/AppNav";
import { Footer } from "@/components/Footer";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Lens — A real-time interpretation engine",
  description:
    "Anyone can open a Lens on a concrete source or domain. Participants stake capital behind competing structured interpretations. GenLayer adjudicates which interpretation best fits the live evidence. The winner becomes the live output, readable by any agent or contract.",
};

// Every route depends on client-side wallet state (RainbowKit/wagmi), so
// there's nothing meaningful to statically prerender -- and
// getDefaultConfig throws at module-init time without a WalletConnect
// projectId, which would otherwise crash the build's static generation
// pass even though the app runs fine once a real projectId is set.
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${plexMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-bg text-fg">
        <Providers>
          <AppNav />
          <main className="flex-1">{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
