"use client";

import Link from "next/link";
import SettingsForm from "@/components/settings/settings-form";

export default function SettingsPage() {
  return (
    <main className="min-h-0 flex-1 overflow-y-auto bg-[#FBFBFA] dark:bg-[#191918]">
      <div className="mx-auto max-w-md px-6 py-10">
        <Link
          href="/unread"
          className="text-[13px] text-[#787774] underline decoration-[#EAEAEA] underline-offset-4 hover:text-[#111111] dark:hover:text-white"
        >
          ← Back to reading
        </Link>
        <h1 className="font-editorial mt-4 text-[28px] font-medium tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-[#787774]">Manage your sign-in and account.</p>
        <div className="mt-6 rounded-xl border border-[#EAEAEA] bg-white p-5 dark:border-white/10 dark:bg-[#201F1E]">
          <SettingsForm />
        </div>
      </div>
    </main>
  );
}
