export default function (event) {
  if (event.body?.type !== "invoice.paid") return null;

  const invoice = event.body.data.object;
  return {
    body: {
      id: invoice.id,
      amount: invoice.amount_paid,
      currency: invoice.currency,
      customer: invoice.customer,
    },
    destinations: ["billing", "analytics"],
  };
}
