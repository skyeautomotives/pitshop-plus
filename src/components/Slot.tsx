import type { ReactNode } from "react";

/**
 * Puts `children` (a link, bold text) where `{name}` appears in a translated sentence,
 * so each language can place it where its word order needs it.
 */
export default function Slot({ text, name, children }: { text: string; name: string; children: ReactNode }) {
  const [before, after = ""] = text.split(`{${name}}`);
  return (
    <>
      {before}
      {children}
      {after}
    </>
  );
}
