import type { AppProps } from "next/app";
import RequireAuth from "../components/login/RequireAuth";
import "@/styles/globals.css";

export default function MyApp({ Component, pageProps, router }: AppProps) {
  return (
    <RequireAuth>
      <Component {...pageProps} key={router.route} />
    </RequireAuth>
  );
}