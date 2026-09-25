import Image from "next/image";

const LIST = ["Unread", "Starred", "All"];

/* 4 cells, 4 columns x 2 rows, every slot filled. Placement is explicit
   because auto-flow would strand the last cell under the first. */
export default function Features() {
  return (
    <section id="features" className="scroll-mt-20 py-24 sm:py-32">
      <div className="mx-auto max-w-[1400px] px-5 sm:px-8">
        <h2
          className="font-editorial reveal max-w-[20ch] text-[32px] leading-[1.05] sm:text-[42px]"
          style={{ "--index": 0 } as React.CSSProperties}
        >
          The parts that make a reader usable.
        </h2>
        <p
          className="reveal mt-6 max-w-[58ch] text-[17px] leading-relaxed text-[#a3a3a3]"
          style={{ "--index": 1 } as React.CSSProperties}
        >
          Folders, search, and a page that renders the whole story, including
          the code and video inside it.
        </p>

        <div
          className="reveal mt-12 grid grid-cols-1 gap-3 sm:mt-16 md:grid-cols-2 lg:grid-cols-4 lg:auto-rows-[200px]"
          style={{ "--index": 2 } as React.CSSProperties}
        >
          <Cell className="lg:col-span-2 lg:row-span-2">
            <div className="min-h-0 flex-1">
              <Image
                src="/landing/reader-list.webp"
                alt="Ledger's sidebar and story list, with the search field above and the folder tree down the left"
                width={1164}
                height={582}
                sizes="(max-width: 1024px) 100vw, 50vw"
                className="block h-full w-full object-cover"
              />
            </div>
            <Strip>
              <h3 className="text-[15px] font-medium text-[#f2f2f2]">
                One list for every feed
              </h3>
              <p className="mt-1 text-[14px] leading-relaxed text-[#6e6e6e]">
                {LIST.join(" · ")}, and a folder for the rest.
              </p>
            </Strip>
          </Cell>

          <Cell className="lg:col-start-3 lg:row-start-1">
            <div className="flex h-full flex-col justify-between gap-4 p-5">
              <div className="flex items-center gap-1.5">
                <kbd>⌘</kbd>
                <kbd>K</kbd>
              </div>
              <div>
                <h3 className="text-[15px] font-medium text-[#f2f2f2]">
                  Search
                </h3>
                <p className="mt-1 text-[13px] leading-relaxed text-[#6e6e6e]">
                  Across every feed you follow.
                </p>
              </div>
            </div>
          </Cell>

          <Cell className="lg:col-start-4 lg:row-span-2">
            <div className="min-h-0 flex-1">
              <Image
                src="/landing/reader-folders.webp"
                alt="The folder sidebar, with an unread count beside each folder"
                width={284}
                height={500}
                sizes="(max-width: 1024px) 100vw, 25vw"
                className="block h-full w-full object-cover object-top"
              />
            </div>
            <Strip>
              <h3 className="text-[15px] font-medium text-[#f2f2f2]">
                Folders you can drag
              </h3>
              <p className="mt-1 text-[13px] leading-relaxed text-[#6e6e6e]">
                Drop a feed into a folder to file it.
              </p>
            </Strip>
          </Cell>

          <Cell className="lg:col-start-3 lg:row-start-2">
            <div className="flex h-full flex-col justify-end gap-2.5 p-5">
              <h3 className="font-editorial text-[19px] leading-[1.15] text-[#f2f2f2]">
                Code and video stay in the page.
              </h3>
              <p className="text-[13px] leading-relaxed text-[#6e6e6e]">
                Highlighting, wide tables, and players.
              </p>
            </div>
          </Cell>
        </div>
      </div>
    </section>
  );
}

function Cell({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`flex flex-col overflow-hidden rounded-[10px] border border-white/[0.08] bg-[#0a0a0a] ${className}`}
    >
      {children}
    </div>
  );
}

function Strip({ children }: { children: React.ReactNode }) {
  return (
    <div className="shrink-0 border-t border-white/[0.08] px-4 py-4">
      {children}
    </div>
  );
}
