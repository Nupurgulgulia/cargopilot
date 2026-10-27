// Features that exist in this build. The guided tour shows an optional step only when its flag is on
// (and its element is on the page), so it never describes something that isn't there.
export const FEATURES = {
  invoice: true,
  compliance: true,
  labels: true,
  invoiceEmail: true,
} as const;
