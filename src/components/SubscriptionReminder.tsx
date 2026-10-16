import { useEffect, useState } from "react";
import { formatDate } from "../lib/format";
import { supabase } from "../lib/supabase";
import { CONTACT_EMAIL } from "../pages/marketing/Site";

interface MySubscription {
  plan_name: string | null;
  status: string;
  state: "trial" | "trial_ended" | "active" | "overdue" | "cancelled";
  trial_ends_at: string | null;
  paid_until: string | null;
}

const DAY = 86_400_000;
const dismissKey = (state: string) => `pitstop:sub-reminder:${state}:${new Date().toISOString().slice(0, 10)}`;

function daysUntil(date: string): number {
  return Math.ceil((new Date(`${date}T23:59:59`).getTime() - Date.now()) / DAY);
}

/**
 * For workshop owners: a reminder when the free trial is about to end, has ended,
 * or a payment is overdue. Never blocks the app; can be hidden for the day.
 */
export default function SubscriptionReminder() {
  const [sub, setSub] = useState<MySubscription | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void supabase.rpc("my_subscription").then(({ data, error }) => {
      if (!cancelled && !error) setSub(((data as MySubscription[] | null) ?? [])[0] ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!sub || hidden) return null;
  let text: string | null = null;
  if (sub.state === "trial" && sub.trial_ends_at) {
    const days = daysUntil(sub.trial_ends_at);
    if (days <= 7) {
      text =
        days <= 0
          ? `Your free trial ends today.`
          : `Your free trial ends in ${days} ${days === 1 ? "day" : "days"} (${formatDate(sub.trial_ends_at)}).`;
    }
  } else if (sub.state === "trial_ended") {
    text = "Your free trial has ended.";
  } else if (sub.state === "overdue") {
    text = sub.paid_until ? `Your Pitshop Plus payment is due (paid until ${formatDate(sub.paid_until)}).` : "Your Pitshop Plus payment is due.";
  }
  if (!text) return null;
  try {
    if (localStorage.getItem(dismissKey(sub.state))) return null;
  } catch {
    /* storage unavailable */
  }

  return (
    <div className="alert sub-reminder no-print" role="status">
      <span>
        <strong>{text}</strong> To keep using Pitshop Plus, contact Skye Automotives at{" "}
        <a href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("Pitshop Plus subscription")}`}>{CONTACT_EMAIL}</a>.
      </span>
      <button
        type="button"
        className="link-button"
        onClick={() => {
          try {
            localStorage.setItem(dismissKey(sub.state), "1");
          } catch {
            /* storage unavailable */
          }
          setHidden(true);
        }}
      >
        Hide for today
      </button>
    </div>
  );
}
