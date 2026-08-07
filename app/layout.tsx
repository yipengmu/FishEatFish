import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

const title = "Fish Eat Fish — 海底寻宝大冒险";
const description = "吃掉饼干和小鱼，躲开危险的大鱼，陪可爱的小丑鱼找到传说中的大秘宝。";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") || "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
  const imageUrl = `${protocol}://${host}/og.png`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      images: [{ url: imageUrl, width: 1672, height: 1001, alt: "Fish Eat Fish 海底寻宝大冒险" }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [imageUrl],
    },
  };
}

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
