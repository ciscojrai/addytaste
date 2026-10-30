import type { ReactNode } from 'react';

const Svg = ({ children, size = 16 }: { children: ReactNode; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);
export const Check = () => <Svg><path d="M5 12.5l4.5 4.5L19 7.5" /></Svg>;
export const Plus = () => <Svg><path d="M12 5v14M5 12h14" /></Svg>;
export const Minus = () => <Svg><path d="M5 12h14" /></Svg>;
export const ImageIcon = () => <Svg size={18}><rect x="3" y="4" width="18" height="16" rx="3" /><circle cx="9" cy="10" r="1.6" /><path d="M21 16l-5-5-8 8" /></Svg>;
export const Send = () => <Svg size={18}><path d="M5 12h13M13 6l6 6-6 6" /></Svg>;
export const Sun = () => <Svg size={18}><circle cx="12" cy="12" r="4" /><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6L7 7M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4" /></Svg>;
export const Moon = () => <Svg size={18}><path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z" /></Svg>;
export const Menu = () => <Svg size={18}><path d="M4 7h16M4 12h16M4 17h16" /></Svg>;
export const External = () => <Svg size={14}><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5" /></Svg>;
export const Play = () => <Svg size={28}><rect x="3" y="5" width="18" height="14" rx="3" /><path d="M10 9.5l5 2.5-5 2.5z" /></Svg>;
export const Logo = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 17l5-10 3 6 2-4 4 8" /></svg>
);
export const Heart = ({ filled = false }: { filled?: boolean }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 20s-7-4.35-9-8.5C1.5 8 3.5 4.5 7 4.5c2 0 3.5 1 5 3 1.5-2 3-3 5-3 3.5 0 5.5 3.5 4 7-2 4.15-9 8.5-9 8.5z" />
  </svg>
);
export const Pencil = () => <Svg><path d="M4 20h4L19 9a2.8 2.8 0 00-4-4L4 16v4z" /><path d="M13.5 6.5l4 4" /></Svg>;
