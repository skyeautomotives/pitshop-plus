/** Wrench mark used in the header and on the sign-in screen. */
export default function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg className="logo" width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="14" fill="#f97316" />
      <path
        fill="#fff"
        d="M41.6 14.2a12 12 0 0 0-12.9 15.5L15.5 42.9a4.4 4.4 0 1 0 6.2 6.2l13.2-13.2a12 12 0 0 0 15.5-12.9l-6.6 6.6-6-1.6-1.6-6z"
      />
    </svg>
  );
}
