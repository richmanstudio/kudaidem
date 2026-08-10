"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "./icons";
import { haptic } from "./telegram-bridge";

export function Topbar({ title }: { title: string }) {
  const router = useRouter();
  return <header className="topbar"><button className="icon-button" aria-label="Назад" onClick={() => { haptic(); router.back(); }}><ArrowLeft /></button><div className="topbar-title">{title}</div><div /></header>;
}
