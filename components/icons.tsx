import type { ReactNode, SVGProps } from "react";

function Icon({ children, ...props }: SVGProps<SVGSVGElement> & { children: ReactNode }) {
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{children}</svg>;
}

export const ArrowLeft = (p: SVGProps<SVGSVGElement>) => <Icon {...p}><path d="m15 18-6-6 6-6"/></Icon>;
export const ArrowRight = (p: SVGProps<SVGSVGElement>) => <Icon {...p}><path d="m9 18 6-6-6-6"/></Icon>;
export const ChevronDown = (p: SVGProps<SVGSVGElement>) => <Icon {...p}><path d="m6 9 6 6 6-6"/></Icon>;
export const Users = (p: SVGProps<SVGSVGElement>) => <Icon {...p}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></Icon>;
export const Wallet = (p: SVGProps<SVGSVGElement>) => <Icon {...p}><path d="M20 7V5a2 2 0 0 0-2-2H5a3 3 0 0 0 0 6h15v12H5a3 3 0 0 1-3-3V6"/><path d="M16 13h4"/></Icon>;
export const Clock = (p: SVGProps<SVGSVGElement>) => <Icon {...p}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></Icon>;
export const Navigation = (p: SVGProps<SVGSVGElement>) => <Icon {...p}><path d="m3 11 18-8-8 18-2-8-8-2Z"/></Icon>;
export const Sparkles = (p: SVGProps<SVGSVGElement>) => <Icon {...p}><path d="m12 3-1.2 3.2L8 7.5l2.8 1.3L12 12l1.2-3.2L16 7.5l-2.8-1.3L12 3Z"/><path d="m18.5 13-.8 2.1-2.2.9 2.2.9.8 2.1.8-2.1 2.2-.9-2.2-.9-.8-2.1Z"/></Icon>;
export const Heart = (p: SVGProps<SVGSVGElement>) => <Icon {...p}><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z"/></Icon>;
export const X = (p: SVGProps<SVGSVGElement>) => <Icon {...p}><path d="M18 6 6 18M6 6l12 12"/></Icon>;
export const Share = (p: SVGProps<SVGSVGElement>) => <Icon {...p}><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 10.5 6.8-4M8.6 13.5l6.8 4"/></Icon>;
