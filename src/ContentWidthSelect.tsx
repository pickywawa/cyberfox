import { useLayoutEffect, useRef, type SelectHTMLAttributes } from 'react';

export function ContentWidthSelect({
  children,
  className = '',
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  const ref = useRef<HTMLSelectElement>(null);
  useLayoutEffect(() => {
    const select = ref.current;
    if (!select) return;
    let disposed = false;
    const measure = () => {
      if (disposed) return;
      const style = getComputedStyle(select);
      const label = document.createElement('span');
      label.textContent = select.selectedOptions[0]?.label ?? '';
      Object.assign(label.style, {
        position: 'fixed',
        visibility: 'hidden',
        whiteSpace: 'pre',
        fontFamily: style.fontFamily,
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        fontStyle: style.fontStyle,
        letterSpacing: style.letterSpacing,
      });
      document.body.append(label);
      const textWidth = label.getBoundingClientRect().width;
      label.remove();
      const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
      const border = parseFloat(style.borderLeftWidth) + parseFloat(style.borderRightWidth);
      select.style.width = Math.ceil(textWidth + padding + border + 3) + 'px';
    };
    measure();
    void document.fonts.ready.then(measure);
    return () => {
      disposed = true;
    };
  }, [props.value, children]);
  return (
    <select {...props} ref={ref} className={'content-width-select ' + className}>
      {children}
    </select>
  );
}
