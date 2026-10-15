import { useCallback, useEffect, useState, type FormEvent } from "react";
import { addStaff, listStaff, removeStaff, resetStaffPassword, setStaffName, setStaffUsername } from "../lib/api";
import { useMe } from "../lib/staff";
import { errorMessage } from "../lib/supabase";
import type { StaffMember, StaffRole } from "../lib/types";
import { normalizeUsername, USERNAME_HINT, usernameError } from "../lib/username";
import ConfirmDialog from "./ConfirmDialog";
import { Field, fieldProps } from "./fields";

const MIN_PASSWORD = 8;

type Notice = { kind: "success" | "error"; text: string } | null;

interface NewLogin {
  full_name: string;
  username: string;
  password: string;
  role: StaffRole;
}

const emptyLogin: NewLogin = { full_name: "", username: "", password: "", role: "staff" };

/** Owner-only: list, add and remove the people who can sign in. */
/** Owner-only: the list of logins ("list") or the form to add one ("add"). */
export default function StaffSection({ show }: { show: "list" | "add" }) {
  const me = useMe();
  const myId = me.status === "ok" ? me.me.user_id : null;
  const [staff, setStaff] = useState<StaffMember[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [form, setForm] = useState<NewLogin>(emptyLogin);
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof NewLogin, string>>>({});
  const [showPassword, setShowPassword] = useState(false);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<StaffMember | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [resetting, setResetting] = useState<{ member: StaffMember; password: string; error?: string } | null>(null);
  const [renaming, setRenaming] = useState<{ member: StaffMember; name: string; username: string; error?: string; usernameError?: string } | null>(null);

  const load = useCallback(async () => {
    try {
      setStaff(await listStaff());
      setLoadError(null);
    } catch (err) {
      setLoadError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function validate(f: NewLogin) {
    const errs: Partial<Record<keyof NewLogin, string>> = {};
    if (!f.full_name.trim()) errs.full_name = "Enter the person's name.";
    const uErr = usernameError(f.username);
    if (uErr) errs.username = uErr;
    if (f.password.length < MIN_PASSWORD) errs.password = `Use at least ${MIN_PASSWORD} characters.`;
    return errs;
  }

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    const errs = validate(form);
    setFormErrors(errs);
    setNotice(null);
    const first = (["full_name", "username", "password"] as const).find((k) => errs[k]);
    if (first) {
      document.getElementById(`f-staff-${first}`)?.focus();
      return;
    }
    setAdding(true);
    try {
      await addStaff({ ...form, full_name: form.full_name.trim(), username: normalizeUsername(form.username) });
      setNotice({
        kind: "success",
        text: `${form.full_name.trim()} can now sign in with the username ${normalizeUsername(form.username)} and the password you set. Share the password with them privately.`,
      });
      setForm(emptyLogin);
      setShowPassword(false);
      await load();
    } catch (err) {
      setNotice({ kind: "error", text: `Couldn't add the login. ${errorMessage(err)}` });
    } finally {
      setAdding(false);
    }
  }

  async function confirmRemove() {
    if (!removing) return;
    const member = removing;
    setRemoving(null);
    setBusyId(member.user_id);
    setNotice(null);
    try {
      await removeStaff(member.user_id);
      setNotice({ kind: "success", text: `${member.full_name || member.username} can no longer sign in. Their bills are kept.` });
      await load();
    } catch (err) {
      setNotice({ kind: "error", text: `Couldn't remove the login. ${errorMessage(err)}` });
    } finally {
      setBusyId(null);
    }
  }

  async function onReset(e: FormEvent) {
    e.preventDefault();
    if (!resetting) return;
    if (resetting.password.length < MIN_PASSWORD) {
      setResetting({ ...resetting, error: `Use at least ${MIN_PASSWORD} characters.` });
      return;
    }
    const { member, password } = resetting;
    setResetting(null);
    setBusyId(member.user_id);
    setNotice(null);
    try {
      await resetStaffPassword(member.user_id, password);
      setNotice({ kind: "success", text: `Password changed for ${member.full_name || member.username}.` });
    } catch (err) {
      setNotice({ kind: "error", text: `Couldn't change the password. ${errorMessage(err)}` });
    } finally {
      setBusyId(null);
    }
  }

  async function onRename(e: FormEvent) {
    e.preventDefault();
    if (!renaming) return;
    const name = renaming.name.trim();
    const username = normalizeUsername(renaming.username);
    const nameErr = !name || name.length > 100 ? "Enter a name (up to 100 characters)." : undefined;
    const uErr = usernameError(username) ?? undefined;
    if (nameErr || uErr) {
      setRenaming({ ...renaming, error: nameErr, usernameError: uErr });
      return;
    }
    const { member } = renaming;
    setRenaming(null);
    setBusyId(member.user_id);
    setNotice(null);
    try {
      if (name !== member.full_name) await setStaffName(member.user_id, name);
      const usernameChanged = username !== member.username;
      if (usernameChanged) await setStaffUsername(member.user_id, username);
      const who = member.user_id === myId ? "You" : name;
      setNotice({
        kind: "success",
        text: usernameChanged
          ? `Saved. ${who} now sign${who === "You" ? "" : "s"} in with the username ${username}.`
          : member.user_id === myId
            ? `Your name is now ${name}. Reload the page to see it everywhere.`
            : `Renamed to ${name}.`,
      });
      await load();
    } catch (err) {
      setNotice({ kind: "error", text: `Couldn't change the name. ${errorMessage(err)}` });
    } finally {
      setBusyId(null);
    }
  }

  const set = (patch: Partial<NewLogin>) => setForm((f) => ({ ...f, ...patch }));

  return (
    <section className="card">
      <h2>{show === "list" ? "Staff logins" : "Add a login"}</h2>
      <p className="hint">
        {show === "list"
          ? "People listed here can sign in and create bills. Owners can also change settings and manage logins."
          : "Give each person their own login, so complaints and bills are recorded under their name."}
      </p>

      {notice && (
        <div className={`alert ${notice.kind === "success" ? "alert-success" : "alert-error"}`} role={notice.kind === "error" ? "alert" : "status"}>
          {notice.text}
        </div>
      )}

      {show === "list" && (loadError ? (
        <div className="alert alert-error" role="alert">
          <span>Couldn't load logins. {loadError}</span>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => void load()}>
            Try again
          </button>
        </div>
      ) : !staff ? (
        <p className="page-status">Loading logins…</p>
      ) : (
        <ul className="staff-list">
          {staff.map((m) => (
            <li key={m.user_id} className="staff-row">
              <div className="staff-info">
                <strong>{m.full_name || m.username}</strong>
                {m.user_id === myId && <span className="badge">You</span>}
                <span className={`badge ${m.role === "owner" ? "badge-owner" : ""}`}>{m.role === "owner" ? "Owner" : "Staff"}</span>
                <div className="muted staff-email">Username: {m.username}</div>
              </div>
              <div className="staff-actions">
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  disabled={busyId === m.user_id}
                  onClick={() => setRenaming({ member: m, name: m.full_name, username: m.username })}
                >
                  Edit name & username
                </button>
                {m.user_id !== myId && (
                  <>
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      disabled={busyId === m.user_id}
                      onClick={() => setResetting({ member: m, password: "" })}
                    >
                      Change password
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      disabled={busyId === m.user_id}
                      onClick={() => setRemoving(m)}
                    >
                      {busyId === m.user_id ? "Working…" : "Remove"}
                    </button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      ))}

      {show === "add" && (
      <form className="staff-add" onSubmit={onAdd} noValidate>
        <div className="grid">
          <Field fieldKey="staff-full_name" label="Name" required error={formErrors.full_name}>
            <input
              {...fieldProps("staff-full_name", formErrors.full_name)}
              type="text"
              autoComplete="off"
              value={form.full_name}
              onChange={(e) => set({ full_name: e.target.value })}
            />
          </Field>
          <Field fieldKey="staff-username" label="Username" required error={formErrors.username} hint={`Used to sign in. ${USERNAME_HINT}`}>
            <input
              {...fieldProps("staff-username", formErrors.username)}
              type="text"
              autoCapitalize="none"
              spellCheck={false}
              autoComplete="off"
              value={form.username}
              onChange={(e) => set({ username: e.target.value })}
            />
          </Field>
          <Field
            fieldKey="staff-password"
            label="Password"
            required
            error={formErrors.password}
            hint={`At least ${MIN_PASSWORD} characters. You'll need to tell them this password.`}
          >
            <div className="password-row">
              <input
                {...fieldProps("staff-password", formErrors.password)}
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                value={form.password}
                onChange={(e) => set({ password: e.target.value })}
              />
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setShowPassword((s) => !s)}>
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </Field>
          <div className="field">
            <span className="label-like">Role</span>
            <label className="check">
              <input
                type="checkbox"
                checked={form.role === "owner"}
                onChange={(e) => set({ role: e.target.checked ? "owner" : "staff" })}
              />
              Owner (can change settings and manage logins)
            </label>
          </div>
        </div>
        <button type="submit" className="btn btn-primary" disabled={adding}>
          {adding ? "Adding…" : "Add login"}
        </button>
      </form>
      )}

      {removing && (
        <ConfirmDialog
          title={`Remove ${removing.full_name || removing.username}?`}
          message="They will no longer be able to sign in. Bills they created are kept."
          cancelLabel="Keep login"
          confirmLabel="Remove login"
          onCancel={() => setRemoving(null)}
          onConfirm={() => void confirmRemove()}
        />
      )}

      {renaming && (
        <div className="modal-backdrop" role="presentation">
          <form className="modal" role="dialog" aria-modal="true" aria-labelledby="rename-title" onSubmit={onRename} noValidate>
            <h2 id="rename-title">{renaming.member.user_id === myId ? "Your name & username" : `Edit ${renaming.member.full_name || renaming.member.username}`}</h2>
            <p className="hint">The name is shown as "Attended by" on complaints and in staff reports; past complaints update too.</p>
            <div className={`field${renaming.error ? " has-error" : ""}`}>
              <label htmlFor="f-rename">Name</label>
              <input
                {...fieldProps("rename", renaming.error)}
                type="text"
                autoComplete="off"
                autoFocus
                value={renaming.name}
                onChange={(e) => setRenaming({ ...renaming, name: e.target.value, error: undefined })}
              />
              {renaming.error && (
                <p className="field-error" id="f-rename-error">
                  {renaming.error}
                </p>
              )}
            </div>
            <div className={`field${renaming.usernameError ? " has-error" : ""}`}>
              <label htmlFor="f-rename-username">Username (used to sign in)</label>
              <input
                {...fieldProps("rename-username", renaming.usernameError)}
                type="text"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                value={renaming.username}
                onChange={(e) => setRenaming({ ...renaming, username: e.target.value, usernameError: undefined })}
              />
              <p className="hint">{USERNAME_HINT}</p>
              {renaming.usernameError && (
                <p className="field-error" id="f-rename-username-error">
                  {renaming.usernameError}
                </p>
              )}
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-outline" onClick={() => setRenaming(null)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary">
                Save
              </button>
            </div>
          </form>
        </div>
      )}

      {resetting && (
        <div className="modal-backdrop" role="presentation">
          <form className="modal" role="dialog" aria-modal="true" aria-labelledby="reset-title" onSubmit={onReset} noValidate>
            <h2 id="reset-title">Change password for {resetting.member.full_name || resetting.member.username}</h2>
            <div className={`field${resetting.error ? " has-error" : ""}`}>
              <label htmlFor="f-reset-password">New password</label>
              <input
                {...fieldProps("reset-password", resetting.error)}
                type="text"
                autoComplete="new-password"
                autoFocus
                value={resetting.password}
                onChange={(e) => setResetting({ ...resetting, password: e.target.value, error: undefined })}
              />
              {resetting.error && (
                <p className="field-error" id="f-reset-password-error">
                  {resetting.error}
                </p>
              )}
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-outline" onClick={() => setResetting(null)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary">
                Change password
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
