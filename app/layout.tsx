import type { Metadata } from "next";
import { cookies } from "next/headers";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { ThemeProvider } from "@/components/theme-provider";
import { MotionProvider } from "@/components/motion-provider";
import { AppSidebar } from "@/components/app-sidebar";
import { Toaster } from "@/components/toaster";
import { InterfaceKit } from "interface-kit/react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Atlas",
  description: "Dein Alltag an einem Ort.",
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
      className={`${GeistSans.variable} ${GeistMono.variable}`}
      suppressHydrationWarning
    >
      <body className="select-none font-sans">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <MotionProvider>
            <div className="flex h-screen overflow-hidden">
              <AppSidebar defaultCollapsed={collapsed} defaultWidth={sidebarWidth} />
              <div className="flex min-w-0 flex-1 flex-col overflow-hidden">{children}</div>
            </div>
            {process.env.NODE_ENV === "development" && <InterfaceKit />}
          </MotionProvider>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
