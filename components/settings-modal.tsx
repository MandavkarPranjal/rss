"use client";

import { useCallback, useEffect, useState } from "react";
import {
  EnvelopeSimple,
  Fingerprint,
  Key,
  Plus,
  Trash,
  X,
} from "@phosphor-icons/react";
import { authClient, useSession } from "@/lib/auth-client";

type Passkey = {
  id: string;
  name?: string | null;
  createdAt?: string | Date | null;
  aaguid?: string | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
};

const inputCls =
  "w-full rounded-[6px] border border-[#EAEAEA] bg-[#FBFBFA] px-3 py-2 text-sm outline-none placeholder:text-[#787774] focus:border-[#111111] focus:bg-white dark:border-white/10 dark:bg-white/5 dark:focus:bg-transparent";

const labelCls = "mb-1.5 block text-[13px] font-medium";

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

function FieldSuccess({ message }: { message: string }) {
  if (!message) return null;
  return (
    <p
      role="status"
      className="rounded-[6px] bg-[#EDF3EC] px-3 py-2 text-[13px] text-[#346538] dark:bg-[#346538]/25 dark:text-[#B3D0B4]"
    >
      {message}
    </p>
  );
}

export default function SettingsModal({ open, onClose }: Props) {
  const { data: session } = useSession();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);

  const [newEmail, setNewEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [emailSuccess, setEmailSuccess] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);

  const [passkeys, setPasskeys] = useState<Passkey[]>([]);
  const [passkeysLoading, setPasskeysLoading] = useState(false);
  const [passkeysError, setPasskeysError] = useState("");
  const [passkeyName, setPasskeyName] = useState("");
  const [addingPasskey, setAddingPasskey] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadPasskeys = useCallback(async () => {
    setPasskeysLoading(true);
    setPasskeysError("");
    try {
      const res = await authClient.passkey.listUserPasskeys();
      if (res.error) {
        setPasskeysError(res.error.message ?? "Could not load passkeys");
      } else {
        setPasskeys((res.data ?? []) as Passkey[]);
      }
    } catch (e) {
      setPasskeysError(e instanceof Error ? e.message : "Could not load passkeys");
    } finally {
      setPasskeysLoading(false);
    }
  }, []);

  const clearNotices = () => {
    setPasswordError("");
    setPasswordSuccess("");
    setEmailError("");
    setEmailSuccess("");
    setPasskeysError("");
  };

  const handleClose = useCallback(() => {
    clearNotices();
    onClose();
  }, [onClose]);

  useEffect(() => {
    // Fetch-on-open: legitimate sync of server state when the dialog opens.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (open) void loadPasskeys();
  }, [open, loadPasskeys]);

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

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError("");
    setPasswordSuccess("");
    if (newPassword.length < 8) {
      setPasswordError("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("New passwords do not match.");
      return;
    }
    setPasswordLoading(true);
    try {
      const { error } = await authClient.changePassword({
        currentPassword,
        newPassword,
        revokeOtherSessions: true,
      });
      if (error) {
        setPasswordError(error.message ?? "Could not change password");
      } else {
        setPasswordSuccess("Password changed. Other sessions were signed out.");
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      }
    } catch (e) {
      setPasswordError(e instanceof Error ? e.message : "Could not change password");
    } finally {
      setPasswordLoading(false);
    }
  };

  const submitEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailError("");
    setEmailSuccess("");
    const trimmed = newEmail.trim();
    if (!trimmed) {
      setEmailError("Enter a new email address.");
      return;
    }
    if (trimmed.toLowerCase() === session?.user.email.toLowerCase()) {
      setEmailError("That is already your primary email.");
      return;
    }
    setEmailLoading(true);
    try {
      const { error } = await authClient.changeEmail({
        newEmail: trimmed,
        callbackURL: "/",
      });
      if (error) {
        setEmailError(error.message ?? "Could not change email");
      } else {
        setEmailSuccess(
          "Email update requested. It applies immediately unless verification is required — then check your new inbox to confirm.",
        );
        setNewEmail("");
        await authClient.getSession({ query: { disableCookieCache: true } });
      }
    } catch (e) {
      setEmailError(e instanceof Error ? e.message : "Could not change email");
    } finally {
      setEmailLoading(false);
    }
  };

  const addPasskey = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasskeysError("");
    setAddingPasskey(true);
    try {
      const { error } = await authClient.passkey.addPasskey(
        passkeyName.trim() ? { name: passkeyName.trim() } : undefined,
      );
      if (error) {
        setPasskeysError(error.message ?? "Could not add passkey");
      } else {
        setPasskeyName("");
        await loadPasskeys();
      }
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
    try {
      const { error } = await authClient.passkey.deletePasskey({ id });
      if (error) {
        setPasskeysError(error.message ?? "Could not delete passkey");
      } else {
        setPasskeys((prev) => prev.filter((p) => p.id !== id));
      }
    } catch (e) {
      setPasskeysError(e instanceof Error ? e.message : "Could not delete passkey");
    } finally {
      setDeletingId(null);
    }
  };

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

        <div className="space-y-6 px-5 py-5">
          {/* Password */}
          <section aria-labelledby="settings-password">
            <h3
              id="settings-password"
              className="flex items-center gap-1.5 text-sm font-medium"
            >
              <Key size={15} weight="bold" /> Change password
            </h3>
            <form onSubmit={submitPassword} className="mt-3 space-y-3">
              <div>
                <label htmlFor="settings-current-password" className={labelCls}>
                  Current password
                </label>
                <input
                  id="settings-current-password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label htmlFor="settings-new-password" className={labelCls}>
                  New password
                </label>
                <input
                  id="settings-new-password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  placeholder="Minimum 8 characters"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label htmlFor="settings-confirm-password" className={labelCls}>
                  Confirm new password
                </label>
                <input
                  id="settings-confirm-password"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={inputCls}
                />
              </div>
              <FieldError message={passwordError} />
              <FieldSuccess message={passwordSuccess} />
              <button
                type="submit"
                disabled={passwordLoading}
                className="w-full rounded-[6px] bg-[#111111] py-2 text-sm font-medium text-white transition hover:bg-[#333333] active:scale-[0.98] disabled:opacity-50 dark:bg-[#ECECEA] dark:text-[#191918]"
              >
                {passwordLoading ? "Updating…" : "Update password"}
              </button>
            </form>
          </section>

          {/* Email */}
          <section aria-labelledby="settings-email" className="border-t border-[#EAEAEA] pt-5 dark:border-white/10">
            <h3 id="settings-email" className="flex items-center gap-1.5 text-sm font-medium">
              <EnvelopeSimple size={15} weight="bold" /> Primary email
            </h3>
            <p className="mt-1 text-[13px] text-[#787774]">
              Currently <span className="font-medium text-[#111111] dark:text-white">{session?.user.email}</span>
            </p>
            <form onSubmit={submitEmail} className="mt-3 space-y-3">
              <div>
                <label htmlFor="settings-new-email" className={labelCls}>
                  New email
                </label>
                <input
                  id="settings-new-email"
                  type="email"
                  required
                  placeholder="you@new-address.com"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className={inputCls}
                />
              </div>
              <FieldError message={emailError} />
              <FieldSuccess message={emailSuccess} />
              <button
                type="submit"
                disabled={emailLoading}
                className="w-full rounded-[6px] border border-[#EAEAEA] py-2 text-sm font-medium transition hover:bg-[#F7F6F3] active:scale-[0.98] disabled:opacity-50 dark:border-white/10 dark:hover:bg-white/5"
              >
                {emailLoading ? "Updating…" : "Change email"}
              </button>
            </form>
          </section>

          {/* Passkeys */}
          <section aria-labelledby="settings-passkeys" className="border-t border-[#EAEAEA] pt-5 dark:border-white/10">
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
                        Added {new Date(p.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
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
        </div>
      </div>
    </div>
  );
}
