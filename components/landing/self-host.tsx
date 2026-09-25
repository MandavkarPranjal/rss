const COMMANDS = ["bun install", "bun run db:migrate", "bun run dev"];

const SPECS = [
  {
    label: "Postgres",
    detail: "Drizzle ORM against a database you already have. Neon works.",
  },
  {
    label: "GitHub or passkey",
    detail: "Sessions live in Postgres. No password is ever stored.",
  },
  {
    label: "Refreshes every 6 hours",
    detail: "A GitHub Action calls the refresh route with a bearer token.",
  },
];

export default function SelfHost() {
  return (
    <section
      id="self-host"
      className="scroll-mt-20 border-t border-white/[0.08] py-24 sm:py-32"
    >
      <div className="mx-auto max-w-[1400px] px-5 sm:px-8">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-20">
          <div
            className="reveal"
            style={{ "--index": 0 } as React.CSSProperties}
          >
            <p className="font-mono text-[11px] tracking-[0.2em] text-[#6e6e6e] uppercase">
              Self-hosted
            </p>
            <h2 className="font-editorial mt-6 text-[32px] leading-[1.05] sm:text-[42px]">
              Yours to run.
            </h2>
            <p className="mt-6 max-w-[46ch] text-[17px] leading-relaxed text-[#a3a3a3]">
              Ledger is a Next.js app and a Postgres database. There is no
              account to create and no service to pay.
            </p>
          </div>

          <div
            className="reveal lg:pt-2"
            style={{ "--index": 1 } as React.CSSProperties}
          >
            <div className="overflow-hidden rounded-[10px] border border-white/[0.08] bg-[#0a0a0a]">
              <div className="border-b border-white/[0.08] px-5 py-3">
                <span className="font-mono text-[12px] text-[#6e6e6e]">
                  setup
                </span>
              </div>
              <div className="px-5 py-5 font-mono text-[14px] leading-[2]">
                {COMMANDS.map((command) => (
                  <p key={command}>
                    <span className="select-none text-[#4a4a4a]">$ </span>
                    <span className="text-[#f2f2f2]">{command}</span>
                  </p>
                ))}
              </div>
            </div>
          </div>
        </div>

        <dl
          className="reveal mt-16 grid gap-px border-t border-white/[0.08] sm:mt-20 md:grid-cols-3"
          style={{ "--index": 2 } as React.CSSProperties}
        >
          {SPECS.map((spec) => (
            <div key={spec.label} className="border-b border-white/[0.08] py-6 md:border-b-0 md:pr-8">
              <dt className="font-mono text-[12px] text-[#f2f2f2]">
                {spec.label}
              </dt>
              <dd className="mt-3 max-w-[34ch] text-[14px] leading-relaxed text-[#6e6e6e]">
                {spec.detail}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
