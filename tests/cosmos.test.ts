import assert from "node:assert/strict";
import {
  COSMOS_CITIES,
  mapCosmosStatus,
  cosmosStatusLabel,
} from "../src/lib/cosmos-domain";
import {
  maskApiToken,
  isEncryptedValue,
  encryptSecret,
  decryptSecret,
} from "../src/lib/cosmos-crypto";
import { mapCosmosHttpError } from "../src/lib/cosmos-client";
import {
  normalizeTrackingCode,
  parseTrackingCodes,
  isValidTrackingCode,
  detectTrackingProvider,
} from "../src/lib/tracking-utils";

// 1. Tunisian governorates enum
assert.equal(COSMOS_CITIES.length, 24);
assert.equal(COSMOS_CITIES.includes("Tunis"), true);
assert.equal(COSMOS_CITIES.includes("Sfax"), true);
assert.equal(COSMOS_CITIES.includes("Sousse"), true);

// 2. Status mapping
assert.equal(mapCosmosStatus("pending"), "PENDING");
assert.equal(mapCosmosStatus("to-be-picked"), "READY_FOR_PICKUP");
assert.equal(mapCosmosStatus("in-depot"), "IN_DEPOT");
assert.equal(mapCosmosStatus("in-delivery"), "IN_DELIVERY");
assert.equal(mapCosmosStatus("delivered"), "DELIVERED");
assert.equal(mapCosmosStatus("return-stock"), "RETURN_DEPOT");
assert.equal(mapCosmosStatus("final-return"), "RETURNED");
assert.equal(mapCosmosStatus("received-return"), "RETURNED");

// 3. Status labels
assert.equal(cosmosStatusLabel("delivered"), "Livré");
assert.equal(cosmosStatusLabel("pending"), "En attente");
assert.equal(cosmosStatusLabel("in-delivery"), "En livraison");
assert.equal(cosmosStatusLabel("received-return"), "Retour Reçu");

// 4. Token masking
assert.equal(maskApiToken("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"), "eyJhbGci••••pXVCJ9");
assert.equal(maskApiToken("short"), "••••••••");
assert.equal(maskApiToken(null), "—");

// 5. Encryption / Decryption
process.env.COSMOS_SECRET_KEY = "test-secret-key-for-cosmos-32-octets";
const token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test-payload";
const encrypted = encryptSecret(token);
assert.equal(isEncryptedValue(encrypted), true);
assert.equal(decryptSecret(encrypted), token);

// 6. HTTP Error mapping
assert.equal(mapCosmosHttpError(401, {}).code, "UNAUTHORIZED");
assert.equal(mapCosmosHttpError(400, { message: "Données invalides" }).code, "VALIDATION");
assert.equal(mapCosmosHttpError(404, {}).code, "NOT_FOUND");
assert.equal(mapCosmosHttpError(429, {}).code, "RATE_LIMIT");
assert.equal(mapCosmosHttpError(500, {}).code, "UPSTREAM_5XX");

// 7. Tracking & Barcode (format standard: 12 chiffres 000000000012)
assert.equal(normalizeTrackingCode(" 000000000012 "), "000000000012");
assert.equal(isValidTrackingCode("000000000012"), true);
assert.equal(detectTrackingProvider("000000000012"), "Cosmos");
assert.equal(detectTrackingProvider("30047413627305"), "Colissimo");
assert.equal(detectTrackingProvider("700190916494"), "InstaDelivery");
assert.equal(detectTrackingProvider("8743434S8"), "Intigo");

// 8. Multi-tracking parsing
const parsed = parseTrackingCodes("000000000012\n000000000013, 000000000014");
assert.deepEqual(parsed, ["000000000012", "000000000013", "000000000014"]);

console.log("All Cosmos Delivery unit tests passed successfully! ✓");
