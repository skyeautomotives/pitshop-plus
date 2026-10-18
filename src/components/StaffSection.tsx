import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useT } from "../i18n";
import { addStaff, listStaff, removeStaff, resetStaffPassword, setStaffName, setStaffUsername } from "../lib/api";
import { useMe } from "../lib/staff";
import { errorMessage } from "../lib/supabase";
import type { StaffMember, StaffRole } from "../lib/types";
import { normalizeUsername, usernameError } from "../lib/username";
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
  const { t } = useT();
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
    if (!f.full_name.trim()) errs.full_name = t("staff.nameMissing");
    const uErr = usernameError(f.username);
    if (uErr) errs.username = uErr;
    if (f.password.length < MIN_PASSWORD) errs.password = t("staff.passwordShort", { n: MIN_PASSWORD });
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
        text: t("staff.added", { name: form.full_name.trim(), username: normalizeUsername(form.username) }),
      });
      setForm(emptyLogin);
      setShowPassword(false);
      await load();
    } catch (err) {
      setNotice({ kind: "error", text: t("staff.addFailed", { message: errorMessage(err) }) });
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
      setNotice({ kind: "success", text: t("staff.removed", { name: member.full_name || member.username }) });
      await load();
    } catch (err) {
      setNotice({ kind: "error", text: t("staff.removeFailed", { message: errorMessage(err) }) });
    } finally {
      setBusyId(null);
    }
  }

  async function onReset(e: FormEvent) {
    e.preventDefault();
    if (!resetting) return;
    if (resetting.password.length < MIN_PASSWORD) {
      setResetting({ ...resetting, error: t("staff.passwordShort", { n: MIN_PASSWORD }) });
      return;
    }
    const { member, password } = resetting;
    setResetting(null);
    setBusyId(member.user_id);
    setNotice(null);
    try {
      await resetStaffPassword(member.user_id, password);
      setNotice({ kind: "success", text: t("staff.passwordChanged", { name: member.full_name || member.username }) });
    } catch (err) {
      setNotice({ kind: "error", text: t("staff.passwordFailed", { message: errorMessage(err) }) });
    } finally {
      setBusyId(null);
    }
  }

  async function onRename(e: FormEvent) {
    e.preventDefault();
    if (!renaming) return;
    const name = renaming.name.trim();
    const username = normalizeUsername(renaming.username);
    const nameErr = !name || name.length > 100 ? t("staff.nameInvalid") : undefined;
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
      const isMe = member.user_id === myId;
      setNotice({
        kind: "success",
        text: usernameChanged
          ? isMe
            ? t("staff.youUsername", { username })
            : t("staff.theyUsername", { name, username })
          : isMe
            ? t("staff.yourName", { name })
            : t("staff.renamed", { name }),
      });
      await load();
    } catch (err) {
      setNotice({ kind: "error", text: t("staff.renameFailed", { message: errorMessage(err) }) });
    } finally {
      setBusyId(null);
    }
  }

  const set = (patch: Partial<NewLogin>) => setForm((f) => ({ ...f, ...patch }));

  return (
    <section className="card">
      <h2>{show === "list" ? t("staff.listTitle") : t("staff.addTitle")}</h2>
      <p className="hint">{show === "list" ? t("staff.listHint") : t("staff.addHint")}</p>

      {notice && (
        <div className={`alert ${notice.kind === "success" ? "alert-success" : "alert-error"}`} role={notice.kind === "error" ? "alert" : "status"}>
          {notice.text}
        </div>
      )}

      {show === "list" && (loadError ? (
        <div className="alert alert-error" role="alert">
          <span>{t("staff.loadFailed", { message: loadError })}</span>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => void load()}>
            {t("common.tryAgain")}
          </button>
        </div>
      ) : !staff ? (
        <p className="page-status">{t("staff.loading")}</p>
      ) : (
        <ul className="staff-list">
          {staff.map((m) => (
            <li key={m.user_id} className="staff-row">
              <div className="staff-info">
                <strong>{m.full_name || m.username}</strong>
                {m.user_id === myId && <span className="badge">{t("staff.you")}</span>}
                <span className={`badge ${m.role === "owner" ? "badge-owner" : ""}`}>{m.role === "owner" ? t("common.owner") : t("common.staff")}</span>
                <div className="muted staff-email">{t("staff.username", { username: m.username })}</div>
              </div>
              <div className="staff-actions">
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  disabled={busyId === m.user_id}
                  onClick={() => setRenaming({ member: m, name: m.full_name, username: m.username })}
                >
                  {t("staff.editName")}
                </button>
                {m.user_id !== myId && (
                  <>
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      disabled={busyId === m.user_id}
                      onClick={() => setResetting({ member: m, password: "" })}
                    >
                      {t("staff.changePassword")}
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      disabled={busyId === m.user_id}
                      onClick={() => setRemoving(m)}
                    >
                      {busyId === m.user_id ? t("staff.working") : t("staff.remove")}
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
          <Field fieldKey="staff-full_name" label={t("staff.name")} required error={formErrors.full_name}>
            <input
              {...fieldProps("staff-full_name", formErrors.full_name)}
              type="text"
              autoComplete="off"
              value={form.full_name}
              onChange={(e) => set({ full_name: e.target.value })}
            />
          </Field>
          <Field
            fieldKey="staff-username"
            label={t("staff.usernameLabel")}
            required
            error={formErrors.username}
            hint={t("staff.usernameUse", { hint: t("staff.usernameHint") })}
          >
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
            label={t("staff.password")}
            required
            error={formErrors.password}
            hint={t("staff.passwordHint", { n: MIN_PASSWORD })}
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
                {showPassword ? t("staff.hide") : t("staff.show")}
              </button>
            </div>
          </Field>
          <div className="field">
            <span className="label-like">{t("staff.role")}</span>
            <label className="check">
              <input
                type="checkbox"
                checked={form.role === "owner"}
                onChange={(e) => set({ role: e.target.checked ? "owner" : "staff" })}
              />
              {t("staff.ownerRole")}
            </label>
          </div>
        </div>
        <button type="submit" className="btn btn-primary" disabled={adding}>
          {adding ? t("staff.adding") : t("staff.addButton")}
        </button>
      </form>
      )}

      {removing && (
        <ConfirmDialog
          title={t("staff.removeTitle", { name: removing.full_name || removing.username })}
          message={t("staff.removeMessage")}
          cancelLabel={t("staff.keepLogin")}
          confirmLabel={t("staff.removeLogin")}
          onCancel={() => setRemoving(null)}
          onConfirm={() => void confirmRemove()}
        />
      )}

      {renaming && (
        <div className="modal-backdrop" role="presentation">
          <form className="modal" role="dialog" aria-modal="true" aria-labelledby="rename-title" onSubmit={onRename} noValidate>
            <h2 id="rename-title">
              {renaming.member.user_id === myId
                ? t("staff.yourNameTitle")
                : t("staff.editTitle", { name: renaming.member.full_name || renaming.member.username })}
            </h2>
            <p className="hint">{t("staff.renameHint")}</p>
            <div className={`field${renaming.error ? " has-error" : ""}`}>
              <label htmlFor="f-rename">{t("staff.name")}</label>
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
              <label htmlFor="f-rename-username">{t("staff.usernameSignIn")}</label>
              <input
                {...fieldProps("rename-username", renaming.usernameError)}
                type="text"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                value={renaming.username}
                onChange={(e) => setRenaming({ ...renaming, username: e.target.value, usernameError: undefined })}
              />
              <p className="hint">{t("staff.usernameHint")}</p>
              {renaming.usernameError && (
                <p className="field-error" id="f-rename-username-error">
                  {renaming.usernameError}
                </p>
              )}
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-outline" onClick={() => setRenaming(null)}>
                {t("common.cancel")}
              </button>
              <button type="submit" className="btn btn-primary">
                {t("common.save")}
              </button>
            </div>
          </form>
        </div>
      )}

      {resetting && (
        <div className="modal-backdrop" role="presentation">
          <form className="modal" role="dialog" aria-modal="true" aria-labelledby="reset-title" onSubmit={onReset} noValidate>
            <h2 id="reset-title">{t("staff.resetTitle", { name: resetting.member.full_name || resetting.member.username })}</h2>
            <div className={`field${resetting.error ? " has-error" : ""}`}>
              <label htmlFor="f-reset-password">{t("staff.newPassword")}</label>
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
                {t("common.cancel")}
              </button>
              <button type="submit" className="btn btn-primary">
                {t("staff.changePassword")}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
