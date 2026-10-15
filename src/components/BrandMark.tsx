/** The full Pitstop Plus logo (includes "by Skye Automotives"). */
export default function BrandMark({ className = "login-logo" }: { className?: string }) {
  return <img src={`${import.meta.env.BASE_URL}pitstop-plus.svg`} alt="Pitstop Plus by Skye Automotives" className={className} />;
}
