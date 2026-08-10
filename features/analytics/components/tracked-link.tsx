"use client";

import Link from "next/link";
import { track } from "./analytics-client";

export function TrackedLink({ href, className, eventType, placeId, children }: {
  href: string; className?: string; eventType: string; placeId?: string; children: React.ReactNode;
}) {
  return <Link href={href} className={className} onClick={() => void track(eventType, { placeId })}>{children}</Link>;
}
