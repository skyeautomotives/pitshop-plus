import { useEffect, useState } from "react";
import { lastCustomerForVehicle } from "../lib/api";
import { isLookupKey, vehicleKey, type CustomerFields } from "../lib/customer";

type Found = { customer_name: string; phone: string; address: string | null; vehicle_reg: string };

/**
 * When the vehicle number matches an earlier bill or complaint, offers to fill
 * in that customer's details, so records for the same vehicle stay consistent.
 */
export default function PreviousCustomer({
  fields,
  onUse,
}: {
  fields: CustomerFields;
  onUse: (fields: Partial<CustomerFields>) => void;
}) {
  const key = vehicleKey(fields.vehicleReg);
  const [found, setFound] = useState<Found | null>(null);

  useEffect(() => {
    setFound(null);
    if (!isLookupKey(key)) return;
    let cancelled = false;
    const t = setTimeout(() => {
      lastCustomerForVehicle(key)
        .then((r) => {
          if (!cancelled) setFound(r);
        })
        .catch(() => {
          /* only a convenience; ignore lookup errors */
        });
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [key]);

  if (!found) return null;
  const alreadyFilled =
    fields.customerName.trim() === found.customer_name && fields.phone.replace(/\D/g, "") === found.phone.replace(/\D/g, "");
  if (alreadyFilled) return null;

  return (
    <div className="alert alert-info previous-customer">
      <span>
        Seen before: <strong>{found.customer_name}</strong> · {found.phone}
      </span>
      <button
        type="button"
        className="btn btn-outline btn-sm"
        onClick={() =>
          onUse({
            customerName: found.customer_name,
            phone: found.phone,
            address: found.address ?? "",
            vehicleReg: found.vehicle_reg,
          })
        }
      >
        Use these details
      </button>
    </div>
  );
}
