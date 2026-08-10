"use client";

import { useState } from "react";

export function BetaGate() {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!code.trim() || busy) return;
    setBusy(true); setError(false);
    const response = await fetch("/api/beta/access", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code }) });
    if (response.ok) { location.reload(); return; }
    setBusy(false); setError(true);
  };

  return <div className="screen">
    <div className="eyebrow">Closed beta · Хабаровск</div>
    <h1>Куда идём?</h1>
    <p className="subline">Сейчас приложение доступно участникам закрытого теста. Введите приглашение.</p>
    <form onSubmit={submit} className="result-copy">
      <input aria-label="Код приглашения" value={code} onChange={(event) => setCode(event.target.value)} placeholder="Код приглашения" autoCapitalize="off" autoCorrect="off" />
      {error ? <p className="notice">Код недействителен, исчерпан или истёк.</p> : null}
      <button className="primary-button" type="submit" disabled={busy}>{busy ? "Проверяем…" : "Войти в beta"}</button>
    </form>
  </div>;
}
