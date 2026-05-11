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
  var selector = 'link[rel~="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"], link[href*="/favicon.ico"]';
  var debugIcon = new URLSearchParams(window.location.search).get("debugIcon") === "1";

  function getIconLinks() {
    return Array.from(document.querySelectorAll(selector));
  }

  function logIconLinks() {
    if (!debugIcon) return;
    console.log(
      "SITES_FAVICON_REFRESH_FINAL_LINKS",
      getIconLinks().map(function (link) {
        return {
          rel: link.getAttribute("rel"),
          href: link.getAttribute("href"),
        };
      })
    );
  }

  function refreshFaviconLinks() {
    getIconLinks().forEach(function (link) {
      link.parentNode && link.parentNode.removeChild(link);
    });
    rels.forEach(function (rel) {
      var link = document.createElement("link");
      link.rel = rel;
      link.href = iconUrl;
      document.head.appendChild(link);
    });
    logIconLinks();
  }

  refreshFaviconLinks();
  requestAnimationFrame(refreshFaviconLinks);
  setTimeout(refreshFaviconLinks, 250);
  setTimeout(refreshFaviconLinks, 1000);

  var observer = new MutationObserver(function (mutations) {
    var shouldRefresh = mutations.some(function (mutation) {
      return Array.from(mutation.addedNodes).some(function (node) {
        return (
          node instanceof HTMLLinkElement &&
          typeof node.href === "string" &&
          node.href.indexOf("/favicon.ico") !== -1
        );
      });
    });

    if (shouldRefresh) refreshFaviconLinks();
  });

  observer.observe(document.head, { childList: true });
  setTimeout(function () {
    observer.disconnect();
  }, 2000);
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
