"use client";

import Link from "next/link";
import { ArrowRight } from "@/components/ui/icons";
import { haptic, openExternal } from "@/lib/telegram/client";

export function PlaceActions({
  placeName,
  address,
  latitude,
  longitude,
  planHref,
}: {
  placeName: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  planHref: string;
}) {
  const route = () => {
    haptic("medium");
    const target = latitude != null && longitude != null
      ? `${latitude},${longitude}`
      : `${placeName}${address ? `, ${address}` : ""}, Хабаровск`;
    openExternal(`https://yandex.ru/maps/?rtext=~${encodeURIComponent(target)}&rtt=auto`);
  };

  return (
    <div className="button-row bottom-action">
      <button className="primary-button" type="button" onClick={route}>
        Построить маршрут <ArrowRight />
      </button>
      <Link className="secondary-button" href={planHref}>
        Собрать план на вечер
      </Link>
    </div>
  );
}
