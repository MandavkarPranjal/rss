"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Keyhole, Newspaper } from "@phosphor-icons/react";
import { authClient } from "@/lib/auth-client";

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    const { error } = await authClient.signIn.email(
      { email, password, callbackURL: "/" },
      {
        onSuccess: () => router.replace("/"),
      },
    );
    if (error) setError(error.message ?? "Sign in failed");
    setLoading(false);
  };

  const passkeyLogin = async () => {
    setError("");
    const { error } = await authClient.signIn.passkey(
      {},
      { onSuccess: () => router.replace("/") },
    );
    if (error) setError(error.message ?? "Passkey sign in failed");
  };

  const inputCls =
    "w-full rounded-[6px] border border-[#EAEAEA] bg-[#FBFBFA] px-3 py-2.5 text-sm outline-none placeholder:text-[#787774] focus:border-[#111111] focus:bg-white dark:border-white/10 dark:bg-white/5 dark:focus:bg-transparent";

  return (
    <div className="ambient-wash flex flex-1 items-center justify-center bg-[#FBFBFA] p-6 dark:bg-[#191918]">
      <div className="w-full max-w-sm rounded-xl border border-[#EAEAEA] bg-white p-8 dark:border-white/10 dark:bg-[#201F1E]">
        <span className="flex h-9 w-9 items-center justify-center rounded-[6px] bg-[#111111] text-white dark:bg-[#ECECEA] dark:text-[#191918]">
          <Newspaper size={18} weight="bold" />
        </span>
        <h1 className="font-editorial mt-4 text-[26px] leading-tight font-medium tracking-tight">Welcome back</h1>
        <p className="mt-1 text-sm leading-relaxed text-[#787774]">Sign in to pick up where your reading left off.</p>
        <form onSubmit={onSubmit} className="mt-6 space-y-3">
          <div>
            <label htmlFor="email" className="mb-1.5 block text-[13px] font-medium">Email</label>
            <input id="email" className={inputCls} type="email" required placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label htmlFor="password" className="mb-1.5 block text-[13px] font-medium">Password</label>
            <input id="password" className={inputCls} type="password" required placeholder="Your password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {error && <p role="alert" className="rounded-[6px] bg-[#FDEBEC] px-3 py-2 text-[13px] text-[#9F2F2D] dark:bg-[#9F2F2D]/20 dark:text-[#F3B8B6]">{error}</p>}
          <button disabled={loading} className="w-full rounded-[6px] bg-[#111111] py-2.5 text-sm font-medium text-white transition hover:bg-[#333333] active:scale-[0.98] disabled:opacity-50 dark:bg-[#ECECEA] dark:text-[#191918]">
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <button onClick={passkeyLogin} className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-[6px] border border-[#EAEAEA] py-2.5 text-sm transition hover:bg-[#F7F6F3] active:scale-[0.98] dark:border-white/10 dark:hover:bg-white/5">
          <Keyhole size={15} weight="bold" /> Sign in with passkey
        </button>
        <p className="mt-5 border-t border-[#EAEAEA] pt-4 text-center text-sm text-[#787774] dark:border-white/10">
          No account? <Link href="/sign-up" className="font-medium text-[#111111] underline decoration-[#E0DED9] underline-offset-4 dark:text-white">Sign up</Link>
        </p>
      </div>
    </div>
  );
}
