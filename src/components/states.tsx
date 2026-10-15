import { Link } from "react-router";

export function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="alert alert-error" role="alert">
      <span>Couldn't load the bill. {message}</span>
      <button type="button" className="btn btn-outline btn-sm" onClick={onRetry}>
        Try again
      </button>
    </div>
  );
}

export function BillNotFound() {
  return (
    <div className="empty">
      <h1>Bill not found</h1>
      <p>This bill doesn't exist or the link is wrong.</p>
      <Link to="/bills" className="btn btn-primary">
        Find bills
      </Link>
    </div>
  );
}
