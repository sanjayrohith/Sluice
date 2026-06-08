# Transform scripts

Transforms run after Sluice durably stores a verified event. They receive a frozen
`event` object with `id`, `source`, `headers`, parsed `body`, and the original
UTF-8 `rawBody` string.

The script must export a default function. It may return:

- `null` or `undefined` to filter the event. The event is retained with status
  `filtered` and no delivery is created.
- An object with an optional `body` and `destinations` array. The body is JSON
  encoded for delivery, and the selected destinations retry independently.

Unknown destinations, invalid return values, thrown errors, timeouts, and memory
limit failures quarantine the event with status `quarantined`. The original raw
bytes remain available for inspection and replay.

## Configuration

Add `transform` to a source in `sluice.config.yaml`:

```yaml
sources:
  - id: stripe
    provider: stripe
    secret_env: STRIPE_WEBHOOK_SECRET
    transform: transforms/stripe-invoice-paid.js
    destinations: [billing, analytics]
```

The registry validates the script at startup and reloads it when its file
modification time changes. Scripts run in QuickJS with no network, filesystem,
process, or timer globals and a 100ms execution deadline.

## Worked Stripe example

`transforms/stripe-invoice-paid.js` drops every event except `invoice.paid`, then
forwards a smaller invoice record to both `billing` and `analytics`:

```js
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
```
