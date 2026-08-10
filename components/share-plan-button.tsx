"use client";
import { useRouter } from "next/navigation";
import { ArrowRight, Share } from "./icons";
import { haptic } from "./telegram-bridge";

export function SharePlanButton({ placeName }: { placeName: string }) {
  const router = useRouter();
  const share = async () => {
    haptic("medium");
    const text = `План на вечер: ${placeName}. Решили через «Куда идём?»`;
    if (navigator.share) { try { await navigator.share({ title: "Куда идём?", text, url: window.location.href }); return; } catch {} }
    window.open(`https://t.me/share/url?url=${encodeURIComponent(window.location.href)}&text=${encodeURIComponent(text)}`, "_blank");
  };
  return <div className="button-row bottom-action"><button className="primary-button" onClick={share}><Share/> Поделиться планом</button><button className="secondary-button" onClick={() => router.push(`/room?place=${encodeURIComponent(placeName)}`)}>Создать комнату <ArrowRight/></button></div>;
}
