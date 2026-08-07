import type { Metadata } from "next";
import "./globals.css";

const title = "Fish Eat Fish — 海底寻宝大冒险";
const description = "吃掉饼干和小鱼，躲开危险的大鱼，陪可爱的小丑鱼找到传说中的大秘宝。";

const deploymentUrl = process.env.VERCEL_URL
  ? new URL(`https://${process.env.VERCEL_URL}`)
  : undefined;

export const metadata: Metadata = {
  title,
  description,
  metadataBase: deploymentUrl,
  openGraph: {
    title,
    description,
    type: "website",
    images: [{ url: "/og.png", width: 1672, height: 1001, alt: "Fish Eat Fish 海底寻宝大冒险" }],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
