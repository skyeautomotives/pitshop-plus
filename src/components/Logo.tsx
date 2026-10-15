/** Pitstop Plus gauge mark (white version) used in the dark header. */
export default function Logo({ size = 32 }: { size?: number }) {
  return (
    <img
      className="logo"
      src={`${import.meta.env.BASE_URL}pitstop-emblem-white.svg`}
      height={size}
      width={Math.round((size * 460) / 420)}
      alt=""
      aria-hidden="true"
    />
  );
}
