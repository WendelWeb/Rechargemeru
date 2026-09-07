import { Bricolage_Grotesque, Figtree } from 'next/font/google';

/**
 * Brand fonts, self-hosted by next/font at build time (no request to Google
 * at runtime, no layout shift). Each family lands in a CSS variable that
 * `app/globals.css` maps to the `font-display` / `font-body` utilities.
 *
 * Bricolage Grotesque carries headings, amounts and the tabular numerals of
 * the receipt; Figtree carries running text. Both are variable fonts, so
 * every weight is available without listing them.
 */
export const displayFont = Bricolage_Grotesque({
  subsets: ['latin', 'latin-ext'],
  weight: 'variable',
  axes: ['opsz'],
  variable: '--font-bricolage',
  display: 'swap',
});

export const bodyFont = Figtree({
  subsets: ['latin', 'latin-ext'],
  weight: 'variable',
  variable: '--font-figtree',
  display: 'swap',
});

/** Both variable classes, applied once on `<html>`. */
export const fontVariables = `${displayFont.variable} ${bodyFont.variable}`;
