(() => {
  const localHostnames = new Set(["127.0.0.1", "localhost", "::1"]);
  const local = localHostnames.has(window.location.hostname);
  const vest = local ? window.location.port === "8791" : window.location.hostname.startsWith("vest.");
  const baseHost = vest && !local ? window.location.hostname.slice("vest.".length) : window.location.hostname;
  const path = `${window.location.pathname}${window.location.search}${window.location.hash}`;

  for (const link of document.querySelectorAll(".workspace-switch")) {
    const isVest = link.dataset.workspace === "vest";
    const active = isVest === vest;
    const host = local ? window.location.hostname : (isVest ? `vest.${baseHost}` : baseHost);
    const port = local ? (isVest ? "8791" : "8790") : window.location.port;
    const portSuffix = port ? `:${port}` : "";

    link.href = `${window.location.protocol}//${host}${portSuffix}${path}`;
    link.classList.toggle("active", active);
    link.setAttribute("aria-current", active ? "page" : "false");
  }
})();
