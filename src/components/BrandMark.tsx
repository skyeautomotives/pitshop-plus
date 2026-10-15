/** The Pitstop Plus logo with the maker's byline underneath. */
export default function BrandMark({ className = "login-logo" }: { className?: string }) {
  return (
    <div className="brand-mark">
      <img src={`${import.meta.env.BASE_URL}pitstop-plus.svg`} alt="Pitstop Plus" className={className} />
      <p className="byline">
        by <span>Skye Automotives</span>
      </p>
    </div>
  );
}
