(function () {
  if (new URLSearchParams(window.location.search).get("returnTo") !== "hub") return;

  document.querySelectorAll("a[href]").forEach((link) => {
    const destination = new URL(link.href, window.location.href);
    if (destination.origin !== window.location.origin || !/\/index\.html$/.test(destination.pathname)) return;

    link.href = "/hub.html";
    link.setAttribute("aria-label", "Back to Member Portal");
    link.title = "Back to Member Portal";

    const image = link.querySelector("img");
    if (image) image.alt = "Back to Member Portal";
  });
})();
