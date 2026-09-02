import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { ThemeProvider } from "@/components/theme-provider";
import { MotionProvider } from "@/components/motion-provider";
import { AppSidebar } from "@/components/app-sidebar";
import { MobileHeader } from "@/components/mobile-header";
import { ToastProvider } from "@/components/toast";
import "./globals.css";

export const metadata: Metadata = {
  title: "Atlas",
  description: "Dein Stundenplan.",
};

// Ohne viewportFit "cover" liefert env(safe-area-inset-*) auf dem iPhone
// konstant 0 -- die Klassen, die den Home-Balken und die Notch aussparen,
// waeren wirkungslos. Erst zusammen greifen sie. maximumScale/userScalable
// bleiben bewusst unangetastet: Zoom zu sperren nimmt Nutzern mit schwacher
// Sehkraft ihr letztes Mittel; der iOS-Auto-Zoom auf Eingabefeldern ist
// stattdessen ueber durchgaengig 16px grosse Felder ausgeschlossen.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const collapsed = cookieStore.get("atlas-sidebar")?.value === "1";
  const widthCookie = Number(cookieStore.get("atlas-sidebar-w")?.value);
  const sidebarWidth = Number.isFinite(widthCookie) && widthCookie > 0 ? widthCookie : undefined;

  return (
    <html
      lang="de"
      className={`${GeistSans.variable} ${GeistMono.variable} bg-background`}
      suppressHydrationWarning
    >
      <body className="select-none font-sans">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <MotionProvider>
            <ToastProvider>
            {/* A1 (iOS): dvh statt vh -- 100vh reicht unter Safaris einblendbarer
                Adressleiste ueber den sichtbaren Bereich hinaus und schneidet
                Inhalte ab. dvh folgt der tatsaechlich sichtbaren Hoehe. */}
            {/* Safe-Area: mit viewportFit "cover" (siehe viewport oben) reicht
                die Flaeche jetzt bis unter Notch und Home-Balken. Die seitlichen
                Insets liegen aussen, damit im Querformat weder Sidebar noch
                Inhalt unter der Notch klemmen. */}
            <div className="flex h-dvh overflow-hidden pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
              <AppSidebar defaultCollapsed={collapsed} defaultWidth={sidebarWidth} />
              {/* Unteres Inset an der Inhaltsspalte: die Seiten scrollen jeweils
                  in sich (main mit overflow-y-auto), ihr letztes Element endete
                  sonst hinter dem Home-Balken -- genau dort sitzen "Jetzt
                  synchronisieren", "Archivieren" und "Löschen". */}
              <div className="flex min-w-0 flex-1 flex-col overflow-hidden pb-[env(safe-area-inset-bottom)]">
                <MobileHeader />
                <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
              </div>
            </div>
            </ToastProvider>
          </MotionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
