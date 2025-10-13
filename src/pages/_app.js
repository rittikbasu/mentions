import "@/styles/globals.css";
import Head from "next/head";
import { Geist, Geist_Mono } from "next/font/google";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export default function App({ Component, pageProps }) {
  return (
    <>
      <Head>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"
        />
        <title>Mentions from group chat</title>
        <meta
          name="description"
          content="All your media recommendations from your group chat in one place"
        />

        {/* Open Graph / Social Media */}
        <meta property="og:type" content="website" />
        <meta property="og:title" content="Mentions" />
        <meta
          property="og:description"
          content="All your media recommendations from your group chat in one place"
        />
        <meta property="og:image" content="/og.png" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />

        {/* Twitter */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Mentions" />
        <meta
          name="twitter:description"
          content="All your media recommendations from your group chat in one place"
        />
        <meta name="twitter:image" content="/og.png" />
      </Head>
      <div
        className={`${geistSans.variable} ${geistMono.variable} font-sans max-w-4xl mx-auto`}
      >
        <Component {...pageProps} />
      </div>
    </>
  );
}
