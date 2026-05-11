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
  rels.forEach(function (rel) {
    document.querySelectorAll('link[rel="' + rel + '"]').forEach(function (link) {
      link.parentNode && link.parentNode.removeChild(link);
    });
  });
  rels.forEach(function (rel) {
    var link = document.createElement("link");
    link.rel = rel;
    link.href = iconUrl;
    document.head.appendChild(link);
  });
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
