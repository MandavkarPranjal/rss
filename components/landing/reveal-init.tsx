"use client";

import { useEffect } from "react";

export default function RevealInit() {
  useEffect(() => {
    const root = document.documentElement;
    const nodes = Array.from(document.querySelectorAll<HTMLElement>(".reveal"));
    if (nodes.length === 0) return;

    root.classList.add("reveal-ready");

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
      root.classList.remove("reveal-ready");
    };
  }, []);

  return null;
}
