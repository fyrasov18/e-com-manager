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
assert.equal(mapIntigoHttpError(404, {}).code, "NOT_FOUND");
assert.equal(mapIntigoHttpError(409, {}).code, "CONFLICT");
assert.equal(mapIntigoHttpError(503, {}).code, "UPSTREAM_5XX");
// 8. Masquage clé
assert.equal(maskApiKey("abcdef123456"), "abcd••••3456");
assert.equal(isEncryptedValue("enc:xxx"), true);
assert.equal(isEncryptedValue("plain"), false);

// 9. Intigo Tracking & Code-barres (format: 8743434S8)
assert.equal(normalizeTrackingCode(" 8743434S8 "), "8743434S8");
assert.equal(normalizeTrackingCode("8743434s8"), "8743434S8");
assert.equal(isValidTrackingCode("8743434S8"), true);
assert.equal(detectTrackingProvider("8743434S8"), "Intigo");
assert.equal(detectTrackingProvider("30047413627305"), "Colissimo");
assert.equal(detectTrackingProvider("700190916494"), "InstaDelivery");

// 10. Multi-tracking parsing
const parsed = parseTrackingCodes("8743434S8\n8743435S8, 8743436s8");
assert.deepEqual(parsed, ["8743434S8", "8743435S8", "8743436S8"]);

console.log("Intigo tests passed (including 8743434S8 tracking import)");
