import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { RoleProvider } from "@/components/role-provider";
import { Header } from "@/components/header";
import { ChatPanel } from "@/components/chat-panel";
import { getInbox } from "@/lib/queries";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const metadata: Metadata = {
  title: "TPM Site Audit",
  description: "Technical PM Quality Standard — every button, every pathway, desktop + mobile.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const inbox = await getInbox();
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>
        <RoleProvider>
          <Header inbox={inbox} />
          <main className="main">{children}</main>
          <ChatPanel />
        </RoleProvider>
      </body>
    </html>
  );
}
