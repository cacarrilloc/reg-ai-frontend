"use client";

import Script from "next/script";

declare global {
  interface Window {
    $crisp?: unknown[];
    CRISP_WEBSITE_ID?: string;
  }
}

/** Loads the Crisp live-chat widget when NEXT_PUBLIC_CRISP_WEBSITE_ID is set. */
export function CrispChatScript() {
  const websiteId = process.env.NEXT_PUBLIC_CRISP_WEBSITE_ID?.trim();
  if (!websiteId) {
    return null;
  }

  return (
    <Script id="crisp-chat" strategy="afterInteractive">
      {`window.$crisp=[];window.CRISP_WEBSITE_ID="${websiteId}";(function(){var d=document;var s=d.createElement("script");s.src="https://client.crisp.chat/l.js";s.async=1;d.getElementsByTagName("head")[0].appendChild(s);})();`}
    </Script>
  );
}
