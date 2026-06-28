interface PokeballIconProps {
  size?: number;
  style?: React.CSSProperties;
}

export function PokeballIcon({ size = 18, style }: PokeballIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      style={style}
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Pokeball"
    >
      <circle cx="12" cy="12" r="11" fill="#fff" stroke="#222" strokeWidth="1.5" />
      <path
        d="M 1 12 A 11 11 0 0 1 23 12 Z"
        fill="#dc2626"
        stroke="#222"
        strokeWidth="1.5"
      />
      <line x1="1" y1="12" x2="23" y2="12" stroke="#222" strokeWidth="1.5" />
      <circle cx="12" cy="12" r="4" fill="#fff" stroke="#222" strokeWidth="1.5" />
      <circle cx="12" cy="12" r="1.5" fill="#222" />
    </svg>
  );
}
