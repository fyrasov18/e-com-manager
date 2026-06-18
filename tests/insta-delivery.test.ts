import assert from "node:assert/strict";
import { buildInstaDeliveryTrackingUrl } from "../src/lib/instavia-delivery";

// Tracking endpoint requires login/password in URL path for authentication
const url = buildInstaDeliveryTrackingUrl(
  { login: "demo user", password: "p/a?s&word" },
  " 700190916494 "
);

assert.equal(
  url,
  "https://app.insta-delivery.com/API/tracking/demo%20user/p%2Fa%3Fs%26word/700190916494"
);

console.log("InstaDelivery tests passed");
