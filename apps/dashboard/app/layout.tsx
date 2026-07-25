import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "RPC SLA Platform",
  description: "Decentralized RPC monitoring and SLA verification dashboard",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
