import { useId } from "react";

export default function BrandLogo({ size = 36, className = "" }) {
  const gradId = useId();

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <defs>
        <linearGradient id={gradId} x1="8" y1="6" x2="56" y2="58" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#3B3FD8" />
          <stop offset="100%" stopColor="#14B8A6" />
        </linearGradient>
      </defs>
      <path
        d="M32 6L52 13.5V29.5C52 43.2 43.3 53.7 32 58C20.7 53.7 12 43.2 12 29.5V13.5L32 6Z"
        fill={`url(#${gradId})`}
      />
      <path
        d="M21.5 31.5L28.5 38.5L43 23.5"
        stroke="#FFFFFF"
        strokeWidth="4.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="21.5" cy="31.5" r="2.9" fill="#FFFFFF" />
      <circle cx="28.5" cy="38.5" r="2.9" fill="#FFFFFF" />
      <circle cx="43" cy="23.5" r="2.9" fill="#FFFFFF" />
    </svg>
  );
}
