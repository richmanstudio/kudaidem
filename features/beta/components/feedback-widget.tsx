"use client";

import { useState } from "react";
import { getAnalyticsSessionId } from "@/features/analytics/components/analytics-client";

export function FeedbackWidget() {
  const [message, setMessage] = useState("");
  const [rating, setRating] = useState(5);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!message.trim() || busy) return;
    setBusy(true);
    const response = await fetch("/api/beta/feedback", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId: getAnalyticsSessionId(), rating, message, path: location.pathname }),
    });
    if (response.ok) { setSent(true); setMessage(""); }
    setBusy(false);
  };

  return <details className="notice">
    <summary>{sent ? "Спасибо за отзыв" : "Отзыв о beta"}</summary>
    <form onSubmit={submit} className="result-copy">
      <label>Оценка <select value={rating} onChange={(event) => setRating(Number(event.target.value))}>{[5,4,3,2,1].map((n) => <option value={n} key={n}>{n}/5</option>)}</select></label>
      <textarea value={message} maxLength={1200} onChange={(event) => setMessage(event.target.value)} placeholder="Что сработало или помешало выбрать место?" />
      <button className="secondary-button" type="submit" disabled={busy}>{busy ? "Отправляем…" : "Отправить"}</button>
    </form>
  </details>;
}
