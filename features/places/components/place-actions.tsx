"use client";

import Link from "next/link";
import { ArrowRight, Navigation, Share } from "@/components/ui/icons";
import { buildRouteUrl, normalizeExternalUrl, normalizePhoneLink, shareText } from "@/features/places/domain/experience";
import { track } from "@/features/analytics/components/analytics-client";
import { haptic, openExternal, shareToTelegram } from "@/lib/telegram/client";

export function PlaceActions({ placeId, placeName, address, latitude, longitude, phone, website, planHref }: {
  placeId: string; placeName: string; address: string | null; latitude: number | null; longitude: number | null; phone: string | null; website: string | null; planHref: string;
}) {
  const phoneHref = normalizePhoneLink(phone);
  const websiteUrl = normalizeExternalUrl(website);
  const route = () => { haptic("medium"); void track("ROUTE_OPENED", { placeId }); openExternal(buildRouteUrl({ name: placeName, address, latitude, longitude })); };
  const share = async () => {
    haptic();
    const url = `${window.location.origin}/place/${placeId}${window.location.search}`;
    const text = shareText(placeName, address);
    if (navigator.share) { try { await navigator.share({ title: placeName, text, url }); return; } catch {} }
    shareToTelegram(url, text);
  };
  return <div className="place-actions bottom-action">
    <button className="primary-button" type="button" onClick={route}><Navigation /> Построить маршрут <ArrowRight /></button>
    <div className="place-quick-actions" aria-label="Действия с местом">
      {phoneHref ? <a className="quick-action" href={phoneHref} onClick={() => haptic()}>Позвонить</a> : null}
      {websiteUrl ? <button className="quick-action" type="button" onClick={() => { haptic(); openExternal(websiteUrl); }}>Сайт</button> : null}
      <button className="quick-action" type="button" onClick={() => void share()}><Share width={19} /> Поделиться</button>
    </div>
    <Link className="secondary-button" href={planHref} onClick={() => haptic()}>Собрать план на вечер</Link>
  </div>;
}
