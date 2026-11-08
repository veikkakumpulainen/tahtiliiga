import { ScrollViewStyleReset } from "expo-router/html";
import { type PropsWithChildren } from "react";

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="fi">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover" />
        <meta name="theme-color" content="#171717" />
        <ScrollViewStyleReset />
        {/* iOS Safari: height:100% (Expo's reset) can extend under Safari's bottom
            toolbar, hiding the tab bar. 100dvh tracks the actually visible viewport.
            viewport-fit=cover makes env(safe-area-inset-*) non-zero, so
            useSafeAreaInsets() pads the tab bar above the home indicator. */}
        <style>{`html,body{background-color:#171717;}html,body,#root{height:100%;height:100dvh;}`}</style>
      </head>
      <body>{children}</body>
    </html>
  );
}
