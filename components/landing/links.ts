/* The nav and the footer link to the same sections, so the entries live here
   instead of in both components. */
export const SECTION_LINKS = [
  { href: "/#reading", label: "Reading" },
  { href: "/#features", label: "Features" },
  { href: "/#self-host", label: "Self-host" },
];

export const FOOTER_LINKS = [
  ...SECTION_LINKS,
  { href: "/sign-in", label: "Sign in" },
];
