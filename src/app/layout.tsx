import type { Metadata } from "next";
import { Instrument_Serif, Inter, Geist_Mono } from "next/font/google";
import "./globals.css";

const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Wiko's Spellbook — a trove of singles",
  description:
    "Wiko's Spellbook — browse and order Magic: The Gathering singles from my collection.",
};

// Runs before React hydrates so the stored mode is applied without a flash.
const modeInitScript = `(() => {
  try {
    const stored = localStorage.getItem("wiko.mode");
    const mode = stored === "light" || stored === "dark" ? stored : "dark";
    document.documentElement.setAttribute("data-mode", mode);
  } catch {}
})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-mode="dark"
      data-theme="arcane"
      className={`${instrumentSerif.variable} ${inter.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* First child of body: runs synchronously before children paint so a
            `light` mode stored in localStorage applies without a dark flash. */}
        <script dangerouslySetInnerHTML={{ __html: modeInitScript }} />
        {children}
      </body>
    </html>
  );
}
