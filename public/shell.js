const frame = document.querySelector("#module-frame");
const buttons = Array.from(document.querySelectorAll(".switch"));
const modules = [
  { path: "/accounts/", prefix: "/accounts" },
  { path: "/local-form/", prefix: "/local-form" },
  { path: "/manual/", prefix: "/manual" },
  { path: "/live/", prefix: "/live" }
];

function setActive(button) {
  for (const item of buttons) {
    const active = item === button;
    item.classList.toggle("active", active);
    item.setAttribute("aria-pressed", String(active));
  }
}

function syncActiveFromFrame() {
  try {
    const pathname = frame.contentWindow.location.pathname;
    const module = modules.find((item) => pathname === item.prefix || pathname.startsWith(`${item.prefix}/`)) || modules[3];
    const button = buttons.find((item) => item.dataset.module === module.path);
    if (button) setActive(button);
  } catch {
    // Same-origin pages are expected. Keep current tab if a future external page appears.
  }
}

for (const button of buttons) {
  button.addEventListener("click", () => {
    setActive(button);
    frame.src = button.dataset.module;
  });
}

frame.addEventListener("load", syncActiveFromFrame);
