"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/observability/client";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportClientError(error);
  }, [error]);

  return (
    <div className="screen screen-state">
      <div className="state-mark" aria-hidden="true">!</div>
      <h1 className="state-title">Что-то пошло не так</h1>
      <p className="state-description">
        Ошибка уже записана. Можно повторить действие — данные выбора не должны пострадать.
      </p>
      <button className="primary-button state-action" type="button" onClick={reset}>
        Попробовать снова
      </button>
    </div>
  );
}
