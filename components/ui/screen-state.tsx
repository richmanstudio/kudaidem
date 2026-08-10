import Link from "next/link";

export function ScreenLoader({ label = "Загружаем…" }: { label?: string }) {
  return (
    <section className="screen-state state-fill" aria-live="polite" aria-busy="true">
      <div className="loading-stack" aria-hidden="true">
        <div className="skeleton skeleton-title" />
        <div className="skeleton skeleton-card" />
        <div className="skeleton skeleton-line" />
        <div className="skeleton skeleton-line short" />
      </div>
      <p className="state-description">{label}</p>
    </section>
  );
}

export function EmptyState({
  title,
  description,
  actionHref = "/",
  actionLabel = "На главную",
}: {
  title: string;
  description: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <section className="screen-state state-fill">
      <div className="state-mark" aria-hidden="true">?</div>
      <h1 className="state-title">{title}</h1>
      <p className="state-description">{description}</p>
      <Link className="primary-button state-action" href={actionHref}>
        {actionLabel}
      </Link>
    </section>
  );
}
