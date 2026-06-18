import assert from "node:assert/strict";
import { buildInstaDeliveryTrackingUrl } from "../src/lib/instavia-delivery";

// Tracking endpoint: GET /API/tracking/{barcode} (barcode only, no auth in URL)
const url = buildInstaDeliveryTrackingUrl(
  { login: "demo user", password: "p/a?s&word" },
  " 700190916494 "
);

assert.equal(
  url,
  "https://app.insta-delivery.com/API/tracking/700190916494"
);

console.log("InstaDelivery tests passed");
