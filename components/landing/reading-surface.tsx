import Image from "next/image";

export default function ReadingSurface() {
  return (
    <section
      id="reading"
      className="mt-24 scroll-mt-20 border-y border-white/[0.08] py-20 sm:mt-32 sm:py-28"
    >
      <div className="mx-auto max-w-[1120px] px-5 sm:px-8">
        <h2
          className="font-editorial reveal max-w-[18ch] text-[32px] leading-[1.05] sm:text-[42px]"
          style={{ "--index": 0 } as React.CSSProperties}
        >
          The article, stripped of everything else.
        </h2>
        <p
          className="reveal mt-6 max-w-[58ch] text-[17px] leading-relaxed text-[#a3a3a3]"
          style={{ "--index": 1 } as React.CSSProperties}
        >
          Ledger pulls the full text out of every link, so a long post arrives
          without the newsletter banner, the sidebar, and the cookie notice.
        </p>

        <figure
          className="reveal mt-12 sm:mt-16"
          style={{ "--index": 2 } as React.CSSProperties}
        >
          <div className="overflow-hidden rounded-[10px] border border-white/[0.08]">
            <Image
              src="/landing/reader-post.webp"
              alt="An article open in Ledger, lead image above a large headline"
              width={1180}
              height={850}
              sizes="(max-width: 640px) calc(100vw - 40px), (max-width: 1120px) calc(100vw - 64px), 1056px"
              className="block w-full"
            />
          </div>
          <figcaption className="mt-4 text-[13px] text-[#6e6e6e]">
            PlanetScale on TIN, with the post extracted and read inside Ledger.
          </figcaption>
        </figure>
      </div>
    </section>
  );
}
