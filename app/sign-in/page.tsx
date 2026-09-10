"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { GithubLogo, Keyhole, Newspaper } from "@phosphor-icons/react";
import { toast } from "sonner";
import { authClient, useSession } from "@/lib/auth-client";

type SignInMethod = "github" | "passkey";

const LAST_METHOD_KEY = "rss-last-signin-method";

function readLastMethod(): SignInMethod | null {
  try {
    const value = window.localStorage.getItem(LAST_METHOD_KEY);
    return value === "github" || value === "passkey" ? value : null;
  } catch {
    return null;
  }
}

function rememberMethod(method: SignInMethod) {
  try {
    window.localStorage.setItem(LAST_METHOD_KEY, method);
  } catch {
    // Storage unavailable (private mode, etc.) — badge just won't show.
  }
}

function LastUsedBadge() {
  return (
    <span className="absolute -top-2.5 right-3 rounded-full bg-[#1F6FEB] px-2 py-px text-[11px] font-semibold whitespace-nowrap text-white shadow-sm">
      Last Used
    </span>
  );
}

export default function SignInPage() {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const [error, setError] = useState("");
  const [lastMethod, setLastMethod] = useState<SignInMethod | null>(null);

  useEffect(() => {
    if (!isPending && session) router.replace("/");
  }, [isPending, session, router]);

  useEffect(() => {
    // Read after mount to avoid a server/client hydration mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLastMethod(readLastMethod());
  }, []);

  const passkeyLogin = async () => {
    setError("");
    const request = authClient.signIn.passkey(
      {},
      {
        onSuccess: () => {
          rememberMethod("passkey");
          router.replace("/");
        },
      },
    ).then(({ error }) => {
      if (error) throw new Error(error.message ?? "Passkey sign in failed");
    });
    toast.promise(request, {
      loading: "Checking passkey…",
      success: "Welcome back",
      error: (error) => (error instanceof Error ? error.message : "Passkey sign in failed"),
    });
    try {
      await request;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Passkey sign in failed");
    }
  };

  const githubLogin = async () => {
    setError("");
    // The page navigates away to GitHub, so record the choice up-front —
    // a returning session means this method succeeded.
    rememberMethod("github");
    const request = authClient.signIn
      .social({ provider: "github", callbackURL: "/" })
      .then(({ error }) => {
        if (error) throw new Error(error.message ?? "GitHub sign in failed");
      });
    toast.promise(request, {
      loading: "Redirecting to GitHub…",
      success: "Redirecting to GitHub…",
      error: (error) =>
        error instanceof Error ? error.message : "GitHub sign in failed",
    });
    try {
      await request;
    } catch (e) {
      setError(e instanceof Error ? e.message : "GitHub sign in failed");
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
        <h1 className="font-editorial mt-4 text-[26px] leading-tight font-medium tracking-tight">Welcome back</h1>
        <p className="mt-1 text-sm leading-relaxed text-[#787774]">Sign in to pick up where your reading left off.</p>
        <div className="mt-6 space-y-3">
          {error && <p role="alert" className="rounded-[6px] bg-[#FDEBEC] px-3 py-2 text-[13px] text-[#9F2F2D] dark:bg-[#9F2F2D]/20 dark:text-[#F3B8B6]">{error}</p>}
          <button onClick={githubLogin} className="relative inline-flex w-full items-center justify-center gap-1.5 rounded-[6px] bg-[#111111] py-2.5 text-sm font-medium text-white transition hover:bg-[#333333] active:scale-[0.98] dark:bg-[#ECECEA] dark:text-[#191918]">
            <GithubLogo size={15} weight="bold" /> Sign in with GitHub
            {lastMethod === "github" && <LastUsedBadge />}
          </button>
          <button onClick={passkeyLogin} className="relative inline-flex w-full items-center justify-center gap-1.5 rounded-[6px] border border-[#EAEAEA] py-2.5 text-sm transition hover:bg-[#F7F6F3] active:scale-[0.98] dark:border-white/10 dark:hover:bg-white/5">
            <Keyhole size={15} weight="bold" /> Sign in with passkey
            {lastMethod === "passkey" && <LastUsedBadge />}
          </button>
        </div>
        <p className="mt-5 border-t border-[#EAEAEA] pt-4 text-center text-sm text-[#787774] dark:border-white/10">
          First time here? Just sign in with GitHub — an account is created automatically.
        </p>
      </div>
    </div>
  );
}
