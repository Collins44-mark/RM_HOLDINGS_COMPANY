import { OFFLINE_IDENTITY_MESSAGE } from "./shell-policy";

export function publishOfflineIdentity(userId: string | null) {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  const payload = { type: OFFLINE_IDENTITY_MESSAGE, userId: userId ?? "" };
  void navigator.serviceWorker.ready.then((registration) => {
    registration.active?.postMessage(payload);
  });
  navigator.serviceWorker.controller?.postMessage(payload);
}
