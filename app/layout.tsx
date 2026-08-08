import type { Metadata, Viewport } from "next";
import "./globals.css";

const title = "Fish Eat Fish — 海底寻宝大冒险";
const description = "选择拥有不同技能的海底伙伴，吃掉饼干和小鱼，躲开危险的大鱼，在滚动鱼池里寻找传说中的大秘宝。";

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

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
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
