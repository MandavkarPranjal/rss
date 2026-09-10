"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Fingerprint, MonitorPlay, Plus, SignOut, Trash, UserCircle } from "@phosphor-icons/react";
import { toast } from "sonner";
import { authClient, useSession } from "@/lib/auth-client";
import { setMuxOverrideAll, useMuxOverrideAll } from "@/lib/playback-prefs";

type Passkey = {
  id: string;
  name?: string | null;
  createdAt?: string | Date | null;
  aaguid?: string | null;
};

type SettingsSection = "account" | "passkeys" | "playback";

const settingsSections = [
  ["account", "Account"],
  ["passkeys", "Passkeys"],
  ["playback", "Playback"],
] as const satisfies ReadonlyArray<readonly [SettingsSection, string]>;

const inputCls =
  "w-full rounded-[6px] border border-[#EAEAEA] bg-[#FBFBFA] px-3 py-2 text-sm outline-none placeholder:text-[#787774] focus:border-[#111111] focus:bg-white dark:border-white/10 dark:bg-white/5 dark:focus:bg-transparent";

function FieldError({ message }: { message: string }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="rounded-[6px] bg-[#FDEBEC] px-3 py-2 text-[13px] text-[#9F2F2D] dark:bg-[#9F2F2D]/20 dark:text-[#F3B8B6]"
    >
      {message}
    </p>
  );
}

export default function SettingsForm({ autoLoadPasskeys = true }: { autoLoadPasskeys?: boolean }) {
  const { data: session } = useSession();
  const router = useRouter();

  const [passkeys, setPasskeys] = useState<Passkey[]>([]);
  const [passkeysLoading, setPasskeysLoading] = useState(false);
  const [passkeysError, setPasskeysError] = useState("");
  const [passkeyName, setPasskeyName] = useState("");
  const [addingPasskey, setAddingPasskey] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [mobileSection, setMobileSection] = useState<SettingsSection>("account");
  const mobileTabRefs = useRef<Record<SettingsSection, HTMLButtonElement | null>>({
    account: null,
    passkeys: null,
    playback: null,
  });
  const muxOverrideAll = useMuxOverrideAll();

  const loadSeqRef = useRef(0);

  const handleMobileTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, value: SettingsSection) => {
    const currentIndex = settingsSections.findIndex(([section]) => section === value);
    let nextIndex = currentIndex;

    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        nextIndex = (currentIndex + 1) % settingsSections.length;
        break;
      case "ArrowLeft":
      case "ArrowUp":
        nextIndex = (currentIndex - 1 + settingsSections.length) % settingsSections.length;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = settingsSections.length - 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    const [nextSection] = settingsSections[nextIndex];
    setMobileSection(nextSection);
    mobileTabRefs.current[nextSection]?.focus();
  };

  const loadPasskeys = useCallback(async () => {
    // Guard against out-of-order responses: the mount load and the post-add
    // reload can overlap, and the slower (stale) one must not overwrite the
    // fresher list — otherwise the newly added passkey disappears until reload.
    const seq = ++loadSeqRef.current;
    setPasskeysLoading(true);
    setPasskeysError("");
    try {
      const res = await authClient.passkey.listUserPasskeys();
      if (seq !== loadSeqRef.current) return;
      if (res.error) {
        setPasskeysError(res.error.message ?? "Could not load passkeys");
      } else {
        setPasskeys((res.data ?? []) as Passkey[]);
      }
    } catch (e) {
      if (seq !== loadSeqRef.current) return;
      setPasskeysError(e instanceof Error ? e.message : "Could not load passkeys");
    } finally {
      if (seq === loadSeqRef.current) setPasskeysLoading(false);
    }
  }, []);

  useEffect(() => {
    // Fetch-on-open: legitimate sync of server state when the form mounts.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (autoLoadPasskeys) void loadPasskeys();
  }, [autoLoadPasskeys, loadPasskeys]);

  const signOut = async () => {
    setSigningOut(true);
    const request = authClient.signOut().then(({ error }) => {
      if (error) throw new Error(error.message ?? "Could not sign out");
    });
    toast.promise(request, {
      loading: "Signing out…",
      success: "Signed out",
      error: (error) => (error instanceof Error ? error.message : "Could not sign out"),
    });
    try {
      await request;
      router.replace("/sign-in");
    } catch {
      // Error is surfaced via toast; stay on the page.
    } finally {
      setSigningOut(false);
    }
  };

  const addPasskey = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasskeysError("");
    setAddingPasskey(true);
    const request = authClient.passkey.addPasskey(
        passkeyName.trim() ? { name: passkeyName.trim() } : undefined,
      ).then(async ({ error }) => {
        if (error) throw new Error(error.message ?? "Could not add passkey");
        setPasskeyName("");
        await loadPasskeys();
      });
    toast.promise(request, {
      loading: "Registering passkey…",
      success: "Passkey added",
      error: (error) => (error instanceof Error ? error.message : "Could not add passkey"),
    });
    try {
      await request;
    } catch (e) {
      setPasskeysError(e instanceof Error ? e.message : "Could not add passkey");
    } finally {
      setAddingPasskey(false);
    }
  };

  const deletePasskey = async (id: string) => {
    if (!confirm("Delete this passkey? You will no longer be able to sign in with it.")) return;
    setPasskeysError("");
    setDeletingId(id);
    const request = authClient.passkey.deletePasskey({ id }).then(({ error }) => {
        if (error) throw new Error(error.message ?? "Could not delete passkey");
        setPasskeys((prev) => prev.filter((p) => p.id !== id));
      });
    toast.promise(request, {
      loading: "Deleting passkey…",
      success: "Passkey deleted",
      error: (error) => (error instanceof Error ? error.message : "Could not delete passkey"),
    });
    try {
      await request;
    } catch (e) {
      setPasskeysError(e instanceof Error ? e.message : "Could not delete passkey");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="grid grid-cols-3 gap-1 rounded-[6px] bg-[#F7F6F3] p-1 sm:hidden dark:bg-white/5" role="tablist" aria-label="Settings sections">
        {settingsSections.map(([value, label]) => (
          <button
            key={value}
            type="button"
            id={`settings-tab-${value}`}
            role="tab"
            aria-selected={mobileSection === value}
            aria-controls={`settings-panel-${value}`}
            tabIndex={mobileSection === value ? 0 : -1}
            ref={(element) => {
              mobileTabRefs.current[value] = element;
            }}
            onClick={() => setMobileSection(value)}
            onKeyDown={(event) => handleMobileTabKeyDown(event, value)}
            className={`rounded-[4px] px-2 py-1.5 text-[12px] font-medium transition active:scale-[0.98] ${
              mobileSection === value
                ? "bg-white text-[#111111] shadow-sm dark:bg-[#343230] dark:text-white"
                : "text-[#787774] hover:text-[#111111] dark:hover:text-white"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <section
        id="settings-panel-account"
        role="tabpanel"
        aria-labelledby="settings-tab-account"
        className={mobileSection === "account" ? "block sm:block" : "hidden sm:block"}
      >
        <h3 id="settings-account" className="flex items-center gap-1.5 text-sm font-medium">
          <UserCircle size={15} weight="bold" /> Account
        </h3>
        <div className="mt-2.5 flex items-center gap-3 rounded-[6px] border border-[#EAEAEA] px-3 py-2.5 sm:mt-3 dark:border-white/10">
          {session?.user.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={session.user.image}
              alt=""
              className="h-9 w-9 shrink-0 rounded-full"
            />
          ) : (
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#F7F6F3] text-sm font-medium text-[#787774] dark:bg-white/5">
              {(session?.user.name ?? session?.user.email ?? "?").charAt(0).toUpperCase()}
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{session?.user.name ?? "Reader"}</span>
            <span className="block truncate text-xs text-[#787774]">{session?.user.email}</span>
          </span>
        </div>
        <p className="mt-2 text-[13px] text-[#787774]">
          Signed in with GitHub or a passkey. There is no password to manage.
        </p>
        <button
          type="button"
          onClick={signOut}
          disabled={signingOut}
          className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-[6px] border border-[#EAEAEA] py-2 text-sm transition hover:bg-[#F7F6F3] active:scale-[0.98] disabled:opacity-50 dark:border-white/10 dark:hover:bg-white/5"
        >
          <SignOut size={14} weight="bold" /> {signingOut ? "Signing out…" : "Sign out"}
        </button>
      </section>

      <section
        id="settings-panel-passkeys"
        role="tabpanel"
        aria-labelledby="settings-tab-passkeys"
        className={`${mobileSection === "passkeys" ? "block" : "hidden"} border-t border-[#EAEAEA] pt-4 sm:block sm:pt-5 dark:border-white/10`}
      >
        <h3 id="settings-passkeys" className="flex items-center gap-1.5 text-sm font-medium">
          <Fingerprint size={15} weight="bold" /> Passkeys
        </h3>
        <p className="mt-1 text-[13px] text-[#787774]">
          Passwordless sign-in with Face ID, Touch ID, or Windows Hello.
        </p>

        <div className="mt-3 space-y-2">
          {passkeysLoading && <p className="text-[13px] text-[#787774]">Loading passkeys…</p>}
          {!passkeysLoading && passkeys.length === 0 && (
            <p className="rounded-[6px] border border-[#EAEAEA] bg-[#F7F6F3] px-3 py-2.5 text-[13px] text-[#787774] dark:border-white/10 dark:bg-white/5">
              No passkeys yet. Add one below.
            </p>
          )}
          {passkeys.map((p) => (
            <div
              key={p.id}
              className="flex items-center gap-2 rounded-[6px] border border-[#EAEAEA] px-3 py-2 dark:border-white/10"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{p.name || "Passkey"}</span>
                {p.createdAt && (
                  <span className="block text-xs text-[#787774]">
                    Added{" "}
                    {new Date(p.createdAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                )}
              </span>
              <button
                onClick={() => deletePasskey(p.id)}
                disabled={deletingId === p.id}
                title="Delete passkey"
                aria-label={`Delete passkey ${p.name || ""}`.trim()}
                className="inline-flex items-center gap-1 rounded-[6px] border border-[#FDEBEC] bg-[#FDEBEC] px-2 py-1.5 text-xs text-[#9F2F2D] transition hover:brightness-95 active:scale-[0.98] disabled:opacity-50 dark:border-transparent dark:bg-[#9F2F2D]/20 dark:text-[#F3B8B6]"
              >
                <Trash size={13} weight="bold" />
                {deletingId === p.id ? "…" : "Delete"}
              </button>
            </div>
          ))}
        </div>

        <form onSubmit={addPasskey} className="mt-3 flex gap-2">
          <input
            value={passkeyName}
            onChange={(e) => setPasskeyName(e.target.value)}
            placeholder="Name (optional, e.g. MacBook)"
            aria-label="Passkey name"
            className={inputCls}
          />
          <button
            type="submit"
            disabled={addingPasskey}
            className="inline-flex shrink-0 items-center gap-1 rounded-[6px] bg-[#111111] px-3 py-2 text-[13px] font-medium text-white transition hover:bg-[#333333] active:scale-[0.98] disabled:opacity-50 dark:bg-[#ECECEA] dark:text-[#191918]"
          >
            <Plus size={13} weight="bold" /> {addingPasskey ? "Adding…" : "Add"}
          </button>
        </form>
        <FieldError message={passkeysError} />
      </section>

      <section
        id="settings-panel-playback"
        role="tabpanel"
        aria-labelledby="settings-tab-playback"
        className={`${mobileSection === "playback" ? "block" : "hidden"} border-t border-[#EAEAEA] pt-4 sm:block sm:pt-5 dark:border-white/10`}
      >
        <h3 id="settings-playback" className="flex items-center gap-1.5 text-sm font-medium">
          <MonitorPlay size={15} weight="bold" /> Video playback
        </h3>
        <p className="mt-1 text-[13px] text-[#787774]">
          JW Player videos always play with Mux Player. Turn this on to also play direct video
          files (.m3u8, .mp4, …) with Mux Player for a consistent experience. YouTube, Vimeo,
          and other provider embeds keep their native players.
        </p>
        <div className="mt-3 flex items-center justify-between gap-3 rounded-[6px] border border-[#EAEAEA] px-3 py-2.5 dark:border-white/10">
          <span className="text-sm font-medium" id="settings-mux-override-label">
            Play all videos with Mux Player
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={muxOverrideAll}
            aria-labelledby="settings-mux-override-label"
            onClick={() => setMuxOverrideAll(!muxOverrideAll)}
            className={`relative h-6 w-11 shrink-0 rounded-full transition ${
              muxOverrideAll ? "bg-[#111111] dark:bg-[#ECECEA]" : "bg-[#EAEAEA] dark:bg-white/15"
            }`}
          >
            <span
              aria-hidden="true"
              className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full shadow transition-transform ${
                muxOverrideAll
                  ? "translate-x-5 bg-white dark:bg-[#191918]"
                  : "translate-x-0 bg-white dark:bg-white"
              }`}
            />
          </button>
        </div>
      </section>
    </div>
  );
}
