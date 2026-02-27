import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "primereact/resources/themes/lara-light-cyan/theme.css";
import "primereact/resources/primereact.min.css";
import "primeicons/primeicons.css";
import { AuthProvider } from "@/contexts/AuthContext";
import AppHeader from "@/components/AppHeader";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "ELBRIT - Component Playground",
  description: "ELBRIT Component Playground",
  icons: {
    icon: [
      { url: '/logo.jpeg', type: 'image/jpeg' },
      { url: '/logo.jpeg', type: 'image/jpeg', sizes: '32x32' },
      { url: '/logo.jpeg', type: 'image/jpeg', sizes: '16x16' },
    ],
    apple: '/logo.jpeg',
    shortcut: '/logo.jpeg',
  },
};



export default function RootLayout({ children }) {
  return (
    <html lang="en" className="light">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-gray-50`}
      >
        <AuthProvider>
          <AppHeader />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}

