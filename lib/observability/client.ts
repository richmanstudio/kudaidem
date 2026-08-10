type ClientErrorPayload = {
  message: string;
  name?: string;
  stack?: string;
  route?: string;
};

export function reportClientError(error: Error) {
  if (typeof window === "undefined") return;

  const payload: ClientErrorPayload = {
    message: error.message.slice(0, 500),
    name: error.name.slice(0, 100),
    stack: error.stack?.slice(0, 3000),
    route: window.location.pathname.slice(0, 300),
  };

  const body = JSON.stringify(payload);

  if (navigator.sendBeacon) {
    navigator.sendBeacon("/api/client-error", new Blob([body], { type: "application/json" }));
    return;
  }

  void fetch("/api/client-error", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => undefined);
}
