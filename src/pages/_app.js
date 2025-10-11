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
          content="Aggregate and browse media recommendations from your group chat"
        />
      </Head>
      <div
        className={`${geistSans.variable} ${geistMono.variable} font-sans max-w-4xl mx-auto`}
      >
        <Component {...pageProps} />
      </div>
    </>
  );
}
