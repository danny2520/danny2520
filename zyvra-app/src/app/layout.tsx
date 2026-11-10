import type { Metadata } from "next";
import "./globals.css";
import "../components/stories.css";
import "../components/clips.css";

export const metadata: Metadata = {
  title: "ZYVRA — Your people. Your pulse.",
  description: "A fresh space for real conversations, creativity and communities.",
  applicationName: "ZYVRA",
  icons: { icon: "/icon.svg" }
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
