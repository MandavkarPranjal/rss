"use client";

import { useCallback, useEffect } from "react";
import { X } from "@phosphor-icons/react";
import SettingsForm from "@/components/settings/settings-form";

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function SettingsModal({ open, onClose }: Props) {
  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, handleClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-2 sm:items-center sm:p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Account settings"
        className="flex max-h-[calc(100dvh-1rem)] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-[#EAEAEA] bg-white shadow-xl dark:border-white/10 dark:bg-[#201F1E] sm:max-h-[90vh]"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-[#EAEAEA] px-4 py-3 sm:px-5 sm:py-4 dark:border-white/10">
          <div>
            <h2 className="font-editorial text-[19px] font-medium tracking-tight sm:text-[20px]">Settings</h2>
            <p className="text-[12px] text-[#787774] sm:text-[13px]">Manage your account, sign-in, and playback.</p>
          </div>
          <button
            onClick={handleClose}
            aria-label="Close settings"
            className="rounded-md p-2 text-[#787774] transition hover:bg-[#F7F6F3] hover:text-[#111111] active:scale-95 dark:hover:bg-white/5 dark:hover:text-white"
          >
            <X size={16} weight="bold" />
          </button>
        </div>

        <div className="min-h-0 overflow-y-auto overscroll-contain px-4 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:px-5 sm:py-5 sm:pb-5">
          <SettingsForm />
        </div>
      </div>
    </div>
  );
}
