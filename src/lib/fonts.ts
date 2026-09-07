import { Barlow_Condensed, Inter } from 'next/font/google';

/** Condensed display face for headings and big numbers (sports/league feel). */
export const displayFont = Barlow_Condensed({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-display',
  display: 'swap',
});

/** Clean body face. */
export const bodyFont = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-body',
  display: 'swap',
});
