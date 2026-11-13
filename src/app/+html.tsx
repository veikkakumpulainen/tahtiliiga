import { ScrollViewStyleReset } from "expo-router/html";
import { type PropsWithChildren } from "react";

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="fi">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        {/* App-like behaviour on phones: no pinch/double-tap zoom and no
            auto-zoom when focusing an input. */}
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, shrink-to-fit=no" />
        <meta name="theme-color" content="#171717" />
        <ScrollViewStyleReset />
        {/* iOS (26+) Safari: the floating bottom toolbar overlays normal-flow content,
            so the tab bar (last flex child of #root) ended up underneath it. Safari
            keeps position:fixed boxes clear of its toolbar, so pin the app shell
            to the visible viewport. */}
        <style>{`html,body{background-color:#171717;}#root{position:fixed;top:0;left:0;right:0;bottom:0;height:auto;}html,body,#root{touch-action:pan-x pan-y;}`}</style>
        {/* iOS Safari ignores user-scalable=no for pinch gestures, so block them explicitly. */}
        <script dangerouslySetInnerHTML={{ __html: `document.addEventListener("gesturestart",function(e){e.preventDefault();},{passive:false});` }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
