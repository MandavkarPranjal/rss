"use client";

import { useEffect } from "react";

/* Closes the reveal gate while the document is still parsing, so no section
   is painted visible and then pulled back after hydration. Client-side
   navigation never runs this script, so the effect below opens the gate
   again. If the observer never takes over, the timeout reveals the rest so
   a reader with broken JavaScript still gets the whole page. */
const GATE = `
(function () {
  var root = document.documentElement;
  root.classList.add("reveal-ready");
  root.dataset.reveal = "pending";
  setTimeout(function () {
    if (root.dataset.reveal !== "pending") return;
    root.querySelectorAll(".landing-root .reveal").forEach(function (node) {
      node.classList.add("is-visible");
    });
  }, 4000);
})();
`;

export default function RevealInit() {
  useEffect(() => {
    const root = document.documentElement;
    const nodes = Array.from(
      root.querySelectorAll<HTMLElement>(".landing-root .reveal"),
    );
    if (nodes.length === 0) return;

    root.classList.add("reveal-ready");
    // The observer owns the gate now, so the inline fallback stands down.
    root.dataset.reveal = "live";

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
      root.removeAttribute("data-reveal");
      root.classList.remove("reveal-ready");
    };
  }, []);

  return <script dangerouslySetInnerHTML={{ __html: GATE }} />;
}
