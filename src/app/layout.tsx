import type { Metadata } from "next";
import { Noto_Sans_Hebrew, Noto_Serif_Hebrew } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "sonner";

// Body / UI — Noto Sans Hebrew: crisp, professional, superb Hebrew coverage.
const notoSans = Noto_Sans_Hebrew({
  variable: "--font-noto-sans",
  subsets: ["hebrew", "latin"],
  display: "swap",
  weight: ["400", "500", "600", "700", "800"],
});

// Display / brand — Noto Serif Hebrew: elegant, distinctive headlines.
const notoSerif = Noto_Serif_Hebrew({
  variable: "--font-noto-serif",
  subsets: ["hebrew", "latin"],
  display: "swap",
  weight: ["500", "600", "700", "900"],
});

export const metadata: Metadata = {
  title: { default: "רדיוס · הערכת מכרזים ליזמי נדל״ן", template: "%s · רדיוס" },
  description:
    "מערכת חיתום קרקע ליזמי נדל״ן בישראל — שווי קרקע שיורי, סימולציית סיכון, גילוי עלויות נסתרות והדמיית מסה תלת־ממדית.",
  applicationName: "רדיוס",
  openGraph: {
    title: "רדיוס · הערכת מכרזים ליזמי נדל״ן",
    description: "חיתום קרקע חכם — שווי שיורי, סיכון, ועלויות נסתרות במקום אחד.",
    locale: "he_IL",
    type: "website",
  },
};

export const viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0b1020" },
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="he"
      dir="rtl"
      suppressHydrationWarning
      className={`${notoSans.variable} ${notoSerif.variable} h-full antialiased`}
    >
      <body className="min-h-full" suppressHydrationWarning>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
          {children}
          <Toaster richColors position="top-center" dir="rtl" />
        </ThemeProvider>
      </body>
    </html>
  );
}
