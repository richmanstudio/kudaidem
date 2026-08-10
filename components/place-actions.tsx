"use client";
import Link from "next/link";
import { ArrowRight } from "./icons";
import { haptic, openExternal } from "./telegram-bridge";

export function PlaceActions({ placeName, planHref }: { placeName: string; planHref: string }) {
  const route = () => { haptic("medium"); openExternal(`https://yandex.ru/maps/?text=${encodeURIComponent(`${placeName} Хабаровск`)}`); };
  return <div className="button-row bottom-action"><button className="primary-button" onClick={route}>Построить маршрут <ArrowRight /></button><Link className="secondary-button" href={planHref}>Собрать план на вечер</Link></div>;
}
