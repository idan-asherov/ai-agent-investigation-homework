import "./globals.css";

export const metadata = {
  title: "Ops Agent",
  description: "DevOps Incident Investigator",
};

export default function RootLayout({ children }) {
  return (
    <html lang="he" dir="rtl">
      <body className="font-sans antialiased bg-zinc-950 text-zinc-100">{children}</body>
    </html>
  );
}
