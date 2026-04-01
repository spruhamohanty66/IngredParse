import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "IngredParse - Know What You Eat",
  description: "AI-powered food label analyser. Scan ingredients and nutrition facts to instantly understand what's in your food.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Public+Sans:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap"
          rel="stylesheet"
        />
      </head>
      <body
        className="overflow-hidden"
        style={{
          fontFamily: "'Public Sans', sans-serif",
          backgroundColor: "#f8f6f6",
          color: "#0f172a",
          height: "100dvh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {children}
      </body>
    </html>
  );
}
