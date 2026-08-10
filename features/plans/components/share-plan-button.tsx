"use client";

import { useRouter } from "next/navigation";
import { ArrowRight, Share } from "@/components/ui/icons";
import { haptic, shareToTelegram } from "@/lib/telegram/client";

export function SharePlanButton({ placeName }: { placeName: string }) {
  const router = useRouter();

  const share = async () => {
    haptic("medium");

    const text = `План на вечер: ${placeName}. Решили через «Куда идём?»`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: "Куда идём?",
          text,
          url: window.location.href,
        });
        return;
      } catch {
        // The native share sheet may be dismissed by the user.
      }
    }

    shareToTelegram(window.location.href, text);
  };

  return (
    <div className="button-row bottom-action">
      <button className="primary-button" type="button" onClick={share}>
        <Share /> Поделиться планом
      </button>
      <button
        className="secondary-button"
        type="button"
        onClick={() => router.push(`/room?place=${encodeURIComponent(placeName)}`)}
      >
        Создать комнату <ArrowRight />
      </button>
    </div>
  );
}
