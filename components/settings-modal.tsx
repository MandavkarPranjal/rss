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
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-4 sm:items-center"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Account settings"
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-[#EAEAEA] bg-white shadow-xl dark:border-white/10 dark:bg-[#201F1E]"
      >
        <div className="flex items-center justify-between border-b border-[#EAEAEA] px-5 py-4 dark:border-white/10">
          <div>
            <h2 className="font-editorial text-[20px] font-medium tracking-tight">Settings</h2>
            <p className="text-[13px] text-[#787774]">Manage your sign-in and account.</p>
          </div>
          <button
            onClick={handleClose}
            aria-label="Close settings"
            className="rounded-md p-1.5 text-[#787774] transition hover:bg-[#F7F6F3] hover:text-[#111111] dark:hover:bg-white/5 dark:hover:text-white"
          >
            <X size={16} weight="bold" />
          </button>
        </div>

        <div className="px-5 py-5">
          <SettingsForm />
        </div>
      </div>
    </div>
  );
}
