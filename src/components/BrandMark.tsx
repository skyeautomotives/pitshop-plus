/** The full Pitshop Plus logo (includes "by Skye Automotives"). */
export default function BrandMark({ className = "login-logo" }: { className?: string }) {
  return <img src={`${import.meta.env.BASE_URL}pitshop-plus.svg`} alt="Pitshop Plus by Skye Automotives" className={className} />;
}
