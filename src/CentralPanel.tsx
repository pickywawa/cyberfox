import { useEffect, useRef, useState, type ReactNode } from 'react';

export function CentralPanel({ children }: { children: ReactNode }) {
  const [active, setActive] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const hide = () => {
    clearTimeout(timer.current);
    setActive(false);
  };
  const show = () => {
    clearTimeout(timer.current);
    setActive(true);
    timer.current = setTimeout(() => setActive(false), 1200);
  };
  useEffect(() => {
    const hide = () => {
      clearTimeout(timer.current);
      setActive(false);
    };
    window.addEventListener('blur', hide);
    return () => {
      clearTimeout(timer.current);
      window.removeEventListener('blur', hide);
    };
  }, []);
  return (
    <main
      className={'center' + (active ? ' scroll-active' : '')}
      onPointerEnter={show}
      onPointerMove={show}
      onPointerLeave={hide}
      onFocusCapture={show}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) hide();
      }}
      onScrollCapture={(event) => {
        if (
          event.currentTarget.matches(':hover') ||
          event.currentTarget.contains(document.activeElement)
        )
          show();
      }}
    >
      {children}
    </main>
  );
}
