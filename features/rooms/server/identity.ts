import { createHmac, timingSafeEqual } from "node:crypto";

export type RoomIdentity = {
  memberKey: string;
  displayName: string;
  telegramId: bigint | null;
  username: string | null;
  verified: boolean;
};

type TelegramUser = {
  id?: number;
  first_name?: string;
  last_name?: string;
  username?: string;
};

function safeKey(value: string | null | undefined) {
  return (value ?? "guest").trim().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64) || "guest";
}

function verifyTelegramInitData(initData: string, botToken: string) {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash || !/^[a-f0-9]{64}$/i.test(hash)) return false;
  params.delete("hash");
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  const digest = createHmac("sha256", secret).update(dataCheckString).digest("hex");
  return timingSafeEqual(Buffer.from(digest, "hex"), Buffer.from(hash, "hex"));
}

export function identityFromRequest(request: Request, fallbackMemberKey?: string, fallbackName?: string): RoomIdentity {
  const initData = request.headers.get("x-telegram-init-data") ?? "";
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (initData && botToken && verifyTelegramInitData(initData, botToken)) {
    const rawUser = new URLSearchParams(initData).get("user");
    try {
      const user = rawUser ? JSON.parse(rawUser) as TelegramUser : null;
      if (user?.id) {
        const displayName = [user.first_name, user.last_name].filter(Boolean).join(" ").trim() || user.username || "Telegram user";
        return {
          memberKey: `tg_${user.id}`,
          displayName: displayName.slice(0, 64),
          telegramId: BigInt(user.id),
          username: user.username?.slice(0, 64) ?? null,
          verified: true,
        };
      }
    } catch {}
  }

  const memberKey = safeKey(fallbackMemberKey);
  return {
    memberKey,
    displayName: (fallbackName?.trim().replace(/\s+/g, " ").slice(0, 64) || "Гость"),
    telegramId: null,
    username: null,
    verified: false,
  };
}
