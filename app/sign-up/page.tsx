"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { GithubLogo, Newspaper } from "@phosphor-icons/react";
import { toast } from "sonner";
import { authClient, useSession } from "@/lib/auth-client";

export default function SignUpPage() {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isPending && session) router.replace("/");
  }, [isPending, session, router]);

  const githubSignUp = async () => {
    setError("");
    const request = authClient.signIn
      .social({ provider: "github", callbackURL: "/" })
      .then(({ error }) => {
        if (error) throw new Error(error.message ?? "GitHub sign up failed");
      });
    toast.promise(request, {
      loading: "Redirecting to GitHub…",
      success: "Redirecting to GitHub…",
      error: (error) =>
        error instanceof Error ? error.message : "GitHub sign up failed",
    });
    try {
      await request;
    } catch (e) {
      setError(e instanceof Error ? e.message : "GitHub sign up failed");
    }
  };

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
        <p className="mt-1 text-sm leading-relaxed text-[#787774]">One list, every feed. Sign up with GitHub, add a passkey later for passwordless sign-in.</p>
        <div className="mt-6 space-y-2">
          {error && <p role="alert" className="rounded-[6px] bg-[#FDEBEC] px-3 py-2 text-[13px] text-[#9F2F2D] dark:bg-[#9F2F2D]/20 dark:text-[#F3B8B6]">{error}</p>}
          <button onClick={githubSignUp} className="inline-flex w-full items-center justify-center gap-1.5 rounded-[6px] bg-[#111111] py-2.5 text-sm font-medium text-white transition hover:bg-[#333333] active:scale-[0.98] dark:bg-[#ECECEA] dark:text-[#191918]">
            <GithubLogo size={15} weight="bold" /> Continue with GitHub
          </button>
        </div>
        <p className="mt-5 border-t border-[#EAEAEA] pt-4 text-center text-sm text-[#787774] dark:border-white/10">
          Have an account? <Link href="/sign-in" className="font-medium text-[#111111] underline decoration-[#E0DED9] underline-offset-4 dark:text-white">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
