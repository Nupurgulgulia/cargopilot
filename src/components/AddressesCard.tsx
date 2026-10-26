"use client";
import { useState } from "react";
import { ADDRESS_FIELDS, addressGaps, addressLine, contactLine, emptyAddress, SIDES, type Side } from "@/lib/addresses";
import type { Address, BookingView } from "@/lib/types";
import type { RunAction } from "./FlightDeck";
import { Check } from "./icons";

// Collection and delivery addresses with contacts: not part of the case template, but a carrier needs them.
export function AddressesCard({ view, run }: { view: BookingView; run: RunAction }) {
  const b = view.booking;
  const gaps = addressGaps(b);
  const [editing, setEditing] = useState<Side | null>(null);

  return (
    <section id="addresses" className="card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">Addresses & contacts</h3>
        {gaps.length === 0 ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800">
            <Check className="h-3.5 w-3.5" /> Ready for the carrier
          </span>
        ) : (
          <span className="text-xs text-amber-800">Needed before emailing the carrier</span>
        )}
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {SIDES.map((side) => {
          const a = b[side.key];
          const city = side.key === "collection" ? b.originCity : b.destinationCity;
          const country = side.key === "collection" ? b.originCountry ?? "United Kingdom" : b.destinationCountry;
          return (
            <div key={side.key} className="rounded-xl border border-slate-200 p-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="label-xs">{side.title}</div>
                  <div className="text-xs text-slate-500">{[city, country].filter(Boolean).join(", ") || "City not set yet"}</div>
                </div>
                {editing !== side.key && (
                  <button type="button" className="text-xs font-medium text-teal-700 hover:underline" onClick={() => setEditing(side.key)}>
                    {a ? "Edit" : "Add"}
                  </button>
                )}
              </div>
              {editing === side.key ? (
                <AddressForm
                  initial={a ?? emptyAddress()}
                  notesLabel={side.notesLabel}
                  onCancel={() => setEditing(null)}
                  onSave={async (value) => {
                    const err = await run({ type: "apply", path: side.key, value });
                    if (!err) setEditing(null);
                    return err;
                  }}
                />
              ) : a && addressLine(a, city) ? (
                <div className="mt-2 space-y-0.5 text-sm">
                  <div className="text-slate-900">{addressLine(a, city)}</div>
                  {contactLine(a) && <div className="text-slate-600">{contactLine(a)}</div>}
                  {a.notes && <div className="text-xs text-slate-500">{a.notes}</div>}
                  {ADDRESS_FIELDS.some((f) => f.required && !a[f.key]) && (
                    <div className="text-xs text-amber-800">
                      Missing: {ADDRESS_FIELDS.filter((f) => f.required && !a[f.key]).map((f) => f.label.toLowerCase()).join(", ")}
                    </div>
                  )}
                </div>
              ) : (
                <p className="mt-2 text-sm italic text-slate-400">Not added yet</p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function AddressForm({
  initial,
  notesLabel,
  onSave,
  onCancel,
}: {
  initial: Address;
  notesLabel: string;
  onSave: (a: Address) => Promise<string | null>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<Address>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const field = (key: keyof Address, label: string, type = "text", wide = false) => (
    <label className={`block text-xs font-medium text-slate-700 ${wide ? "sm:col-span-2" : ""}`}>
      {label}
      <input
        className="input mt-1"
        type={type}
        value={form[key] ?? ""}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
      />
    </label>
  );
  return (
    <form
      className="mt-2 space-y-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(await onSave(form));
        setBusy(false);
      }}
    >
      <div className="grid gap-2 sm:grid-cols-2">
        {field("company", "Company or site name", "text", true)}
        {field("street", "Street address", "text", true)}
        {field("postcode", "Postcode")}
        {field("contactName", "Contact name")}
        {field("phone", "Phone", "tel")}
        {field("email", "Email", "email")}
        {field("notes", `${notesLabel} (optional)`, "text", true)}
      </div>
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800">{error}</p>}
      <div className="flex gap-2">
        <button className="btn-primary px-3 py-1.5 text-xs" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
        <button type="button" className="btn-ghost px-3 py-1.5 text-xs" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
