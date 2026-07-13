import type { Metadata } from 'next';
import { Suspense } from 'react';
import '../index.css';
import '../App.css';
import '../styles/LandingPage.css';
import '../styles/TeamMakerApp.css';
import { AppProviders } from '../contexts/AppSettingsContext';

export const metadata: Metadata = {
  title: 'TeamMaker',
  description: 'Smart team formation made simple',
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon.ico' },
    ],
    apple: '/logo192.png',
  },
  manifest: '/manifest.json',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Suspense fallback={null}>
          <AppProviders>{children}</AppProviders>
        </Suspense>
      </body>
    </html>
  );
}
