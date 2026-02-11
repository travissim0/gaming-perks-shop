import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/AuthContext";
import { AuthErrorBoundary } from "@/components/AuthErrorBoundary";
import { Toaster } from "react-hot-toast";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "FREEINF",
  description: "FREEINF - Community site for development tools, community features, and hub for linux hosted zones. Authored by Axidus.",
  icons: {
    icon: [
      { url: '/images/freeinfantry.png', sizes: '32x32', type: 'image/png' },
      { url: '/images/freeinfantry.png', sizes: '16x16', type: 'image/png' },
    ],
    apple: [
      { url: '/images/freeinfantry.png', sizes: '180x180', type: 'image/png' },
    ],
    shortcut: '/images/freeinfantry.png',
  },
  other: {
    'format-detection': 'telephone=no',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <meta name="format-detection" content="telephone=no" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <AuthErrorBoundary>
          <AuthProvider>
            <Toaster 
              position="top-right"
              toastOptions={{
                duration: 4000,
                style: {
                  background: '#374151',
                  color: '#fff',
                  fontSize: '14px',
                  maxWidth: '90vw',
                },
                success: {
                  style: {
                    background: '#059669',
                  },
                },
                error: {
                  style: {
                    background: '#dc2626',
                  },
                },
              }}
            />
            {children}
          </AuthProvider>
        </AuthErrorBoundary>
      </body>
    </html>
  );
}
