"use client";

import { Toaster as Sonner } from "sonner";

export function Toaster() {
  return (
    <Sonner
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast:
            "!rounded-[8px] !border-[#EAEAEA] !bg-white !text-[#111111] !shadow-[0_8px_24px_rgba(17,17,17,0.08)] dark:!border-white/10 dark:!bg-[#201F1E] dark:!text-[#ECECEA]",
          description: "!text-[#787774]",
          error: "!border-[#FDEBEC] dark:!border-[#9F2F2D]/40",
          success: "!border-[#EDF3EC] dark:!border-[#346538]/40",
        },
      }}
    />
  );
}
