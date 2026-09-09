"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Newspaper } from "@phosphor-icons/react";
import { toast } from "sonner";
import { authClient, useSession } from "@/lib/auth-client";

export default function SignUpPage() {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isPending && session) router.replace("/");
  }, [isPending, session, router]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    const request = authClient.signUp.email(
      { name, email, password, callbackURL: "/" },
      { onSuccess: () => router.replace("/") },
    ).then(({ error }) => {
      if (error) throw new Error(error.message ?? "Sign up failed");
    });
    toast.promise(request, {
      loading: "Creating your account…",
      success: "Account created",
      error: (error) => (error instanceof Error ? error.message : "Sign up failed"),
    });
    try {
      await request;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign up failed");
    } finally {
      setLoading(false);
    }
  };

  const inputCls =
    "w-full rounded-[6px] border border-[#EAEAEA] bg-[#FBFBFA] px-3 py-2.5 text-sm outline-none placeholder:text-[#787774] focus:border-[#111111] focus:bg-white dark:border-white/10 dark:bg-white/5 dark:focus:bg-transparent";

  if (isPending || session) {
    return (
      <div className="flex flex-1 items-center justify-center bg-[#FBFBFA] p-10 dark:bg-[#191918]">
        <p className="text-sm text-[#787774]">Loading…</p>
      </div>
    );
  }

  return (
    <div className="ambient-wash flex flex-1 items-center justify-center bg-[#FBFBFA] p-6 dark:bg-[#191918]">
      <div className="w-full max-w-sm rounded-xl border border-[#EAEAEA] bg-white p-8 dark:border-white/10 dark:bg-[#201F1E]">
        <span className="flex h-9 w-9 items-center justify-center rounded-[6px] bg-[#111111] text-white dark:bg-[#ECECEA] dark:text-[#191918]">
          <Newspaper size={18} weight="bold" />
        </span>
        <h1 className="font-editorial mt-4 text-[26px] leading-tight font-medium tracking-tight">Start reading calmly</h1>
        <p className="mt-1 text-sm leading-relaxed text-[#787774]">One list, every feed. Add a passkey later for passwordless sign-in.</p>
        <form onSubmit={onSubmit} className="mt-6 space-y-3">
          <div>
            <label htmlFor="name" className="mb-1.5 block text-[13px] font-medium">Name</label>
            <input id="name" className={inputCls} required placeholder="Ada Reader" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label htmlFor="email" className="mb-1.5 block text-[13px] font-medium">Email</label>
            <input id="email" className={inputCls} type="email" required placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label htmlFor="password" className="mb-1.5 block text-[13px] font-medium">Password</label>
            <input id="password" className={inputCls} type="password" required minLength={8} placeholder="Minimum 8 characters" value={password} onChange={(e) => setPassword(e.target.value)} />
            <p className="mt-1.5 text-xs text-[#787774]">Use at least 8 characters.</p>
          </div>
          {error && <p role="alert" className="rounded-[6px] bg-[#FDEBEC] px-3 py-2 text-[13px] text-[#9F2F2D] dark:bg-[#9F2F2D]/20 dark:text-[#F3B8B6]">{error}</p>}
          <button disabled={loading} className="w-full rounded-[6px] bg-[#111111] py-2.5 text-sm font-medium text-white transition hover:bg-[#333333] active:scale-[0.98] disabled:opacity-50 dark:bg-[#ECECEA] dark:text-[#191918]">
            {loading ? "Creating…" : "Create account"}
          </button>
        </form>
        <p className="mt-5 border-t border-[#EAEAEA] pt-4 text-center text-sm text-[#787774] dark:border-white/10">
          Have an account? <Link href="/sign-in" className="font-medium text-[#111111] underline decoration-[#E0DED9] underline-offset-4 dark:text-white">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
