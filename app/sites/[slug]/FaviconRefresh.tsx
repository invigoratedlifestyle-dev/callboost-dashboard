"use client";

type FaviconRefreshProps = {
  iconUrl: string;
};

const faviconRels = ["icon", "shortcut icon", "apple-touch-icon"] as const;

export default function FaviconRefresh({ iconUrl }: FaviconRefreshProps) {
  if (!/^https?:\/\//i.test(iconUrl)) return null;

  const script = `
(function () {
  var iconUrl = ${JSON.stringify(iconUrl)};
  if (!/^https?:\\/\\//i.test(iconUrl)) return;
  var rels = ["icon", "shortcut icon", "apple-touch-icon"];
  document
    .querySelectorAll('link[rel~="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"], link[href*="/favicon.ico"]')
    .forEach(function (link) {
      link.parentNode && link.parentNode.removeChild(link);
    });
  rels.forEach(function (rel) {
    var link = document.createElement("link");
    link.rel = rel;
    link.href = iconUrl;
    document.head.appendChild(link);
  });
  if (new URLSearchParams(window.location.search).get("debugIcon") === "1") {
    console.log(
      "SITES_FAVICON_REFRESH_FINAL_LINKS",
      Array.from(
        document.querySelectorAll('link[rel~="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"], link[href*="/favicon.ico"]')
      ).map(function (link) {
        return {
          rel: link.getAttribute("rel"),
          href: link.getAttribute("href"),
        };
      })
    );
  }
})();`;

  return (
    <>
      {faviconRels.map((rel) => (
        <link key={rel} rel={rel} href={iconUrl} />
      ))}
      <script dangerouslySetInnerHTML={{ __html: script }} />
    </>
  );
}
