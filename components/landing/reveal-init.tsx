"use client";

import { useEffect } from "react";

/* The reveal gate closes before the first paint, so no section is shown and
   then pulled back. The hiding rules live in a stylesheet the page inserts for
   itself instead of a class on a React-rendered element, so nothing React owns
   is touched ahead of hydration and no mismatch warning is needed. Client-side
   navigation never parses the script, so the effect below inserts the same
   sheet. Either way the observer takes the gate over and the sheet is removed;
   the inline copy also drops it on a timer, so a reader whose JavaScript never
   hydrates still gets the whole page. */
const GATE_CSS =
  ".landing-root .reveal{opacity:0;visibility:hidden;transform:translateY(14px)}";

function insertGateSheet() {
  // Appended last so it outranks the visible default in landing.css, which has
  // the same specificity but ships in an earlier stylesheet.
  const sheet = document.createElement("style");
  sheet.dataset.revealGate = "pending";
  sheet.textContent = GATE_CSS;
  document.head.append(sheet);
  return sheet;
}

const GATE = `
(function () {
  var sheet = document.createElement("style");
  sheet.dataset.revealGate = "pending";
  sheet.textContent = ${JSON.stringify(GATE_CSS)};
  document.head.append(sheet);
  setTimeout(function () {
    if (sheet.dataset.revealGate !== "pending") return;
    sheet.remove();
  }, 4000);
})();
`;

export default function RevealInit() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".landing-root");
    if (!root) return;
    const nodes = Array.from(root.querySelectorAll<HTMLElement>(".reveal"));
    if (nodes.length === 0) return;

    // A fresh load already inserted the sheet while parsing; a client-side
    // navigation needs one now. Marking it live stands the timer down, because
    // the observer below owns the gate from here.
    const sheet =
      document.querySelector<HTMLStyleElement>("style[data-reveal-gate]") ??
      insertGateSheet();
    sheet.dataset.revealGate = "live";

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.1 },
    );

    for (const node of nodes) observer.observe(node);

    return () => {
      observer.disconnect();
      sheet.remove();
    };
  }, []);

  return <script dangerouslySetInnerHTML={{ __html: GATE }} />;
}
