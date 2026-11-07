import assert from "node:assert/strict";
import { validateIntigoCreateByIds, mapIntigoStatusCode, buildIntigoCid } from "../src/lib/intigo-domain";
import { mapIntigoStatusCode as map2 } from "../src/lib/delivery-status";
import { mapIntigoHttpError } from "../src/lib/intigo-client";
import { maskApiKey, isEncryptedValue } from "../src/lib/intigo-crypto";
import {
  normalizeTrackingCode,
  parseTrackingCodes,
  isValidTrackingCode,
  detectTrackingProvider,
} from "../src/lib/tracking-utils";

// 1-2. Validation téléphone / adresse
let v = validateIntigoCreateByIds({ recipient_name: "A", phone1: "123", destination_address: "x", destination_city_id: 1, destination_district_id: 2, pickup_index: 0 });
assert.equal(v.valid, false);
v = validateIntigoCreateByIds({ recipient_name: "", phone1: "20123456", destination_address: "", destination_city_id: 1, destination_district_id: 2, pickup_index: 0 });
assert.equal(v.valid, false);
// 3. Création valide
v = validateIntigoCreateByIds({ recipient_name: "Mohamed", phone1: "20 123 456", destination_address: "Rue X, Tunis", destination_city_id: 1, destination_district_id: 5, pickup_index: 0, price: 99.5, cid: "ECOM-abc" });
assert.equal(v.valid, true);
assert.equal(v.value?.price, 99.5);
// 3b. Création valide selon la doc API (POST /v3/parcels/ avec exemple officiel)
v = validateIntigoCreateByIds({
  recipient_name: "Ahmed Ben Ali",
  phone1: "98765432",
  destination_address: "Rue de la Liberté 42, Tunis",
  destination_city_id: 1,
  destination_district_id: 5,
  price: 45.5,
  package_size: 1,
  description: "T-shirt bleu",
  can_open: true,
  is_exchange: false,
  cid: "ORDER-2026-00042",
});
assert.equal(v.valid, true);
assert.equal(v.value?.recipient_name, "Ahmed Ben Ali");
assert.equal(v.value?.phone1, "98765432");
assert.equal(v.value?.price, 45.5);
assert.equal(v.value?.description, "T-shirt bleu");
assert.equal(v.value?.cid, "ORDER-2026-00042");

// 4. CID max 50
assert.equal(buildIntigoCid("order-id-123456789", "team-id-123456789").length <= 50, true);
// 5-6. Statuts
assert.equal(mapIntigoStatusCode(5000), "DELIVERED");
assert.equal(mapIntigoStatusCode("6900"), "RETURNED");
assert.equal(mapIntigoStatusCode("9001"), "CANCELLED");
assert.equal(mapIntigoStatusCode(1000), "PICKED_UP");
assert.equal(map2(4000), "IN_DELIVERY");
assert.equal(mapIntigoStatusCode("xyz"), "PENDING");
// 7. Erreurs HTTP
assert.equal(mapIntigoHttpError(401, {}).code, "INVALID_API_KEY");
assert.equal(mapIntigoHttpError(400, { message: "bad" }).code, "VALIDATION");
assert.equal(mapIntigoHttpError(422, { detail: [{ loc: ["header", "x-api-key"], msg: "Field required" }] }).code, "VALIDATION");
assert.equal(mapIntigoHttpError(404, {}).code, "NOT_FOUND");
assert.equal(mapIntigoHttpError(409, {}).code, "CONFLICT");
assert.equal(mapIntigoHttpError(503, {}).code, "UPSTREAM_5XX");
// 8. Masquage clé
assert.equal(maskApiKey("abcdef123456"), "abcd••••3456");
assert.equal(isEncryptedValue("enc:xxx"), true);
assert.equal(isEncryptedValue("plain"), false);

// 9. Intigo Tracking & Code-barres (format: 8743434S8, 12345S7, CID ORDER-2026-00042)
assert.equal(normalizeTrackingCode(" 8743434S8 "), "8743434S8");
assert.equal(normalizeTrackingCode("8743434s8"), "8743434S8");
assert.equal(isValidTrackingCode("8743434S8"), true);
assert.equal(isValidTrackingCode("12345S7"), true);
assert.equal(isValidTrackingCode("ORDER-2026-00042"), true);
assert.equal(detectTrackingProvider("8743434S8"), "Intigo");
assert.equal(detectTrackingProvider("12345S7"), "Intigo");
assert.equal(detectTrackingProvider("ORDER-2026-00042"), "Intigo");
assert.equal(detectTrackingProvider("30047413627305"), "Colissimo");
assert.equal(detectTrackingProvider("700190916494"), "InstaDelivery");

// 10. Multi-tracking parsing
const parsed = parseTrackingCodes("8743434S8\n12345S7, ORDER-2026-00042");
assert.deepEqual(parsed, ["8743434S8", "12345S7", "ORDER-2026-00042"]);

console.log("Intigo tests passed (including 12345S7 and 8743434S8 tracking import)");
