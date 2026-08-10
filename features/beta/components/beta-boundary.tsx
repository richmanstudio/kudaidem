import { cookies } from "next/headers";
import { BetaGate } from "./beta-gate";
import { betaCookieName, betaEnabled, validBetaCookie } from "../server/access";

export async function BetaBoundary({ children }: { children: React.ReactNode }) {
  if (!betaEnabled()) return children;
  const store = await cookies();
  const value = store.get(betaCookieName)?.value;
  return validBetaCookie(value) ? children : <BetaGate />;
}
