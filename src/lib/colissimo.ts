import { prisma } from "@/lib/prisma";
import { mapColissimoStatusStr } from "./delivery-status";

const BASE_URL = "https://delivery.colissimo.com.tn/api/api.v1";
const BASE_URL_V2 = "https://delivery.colissimo.com.tn/api/api.v2";
const SOAP_URL = "https://delivery.colissimo.com.tn/wsColissimoGo/wsColissimoGo.asmx";

function redactColissimoUrl(url: string): string {
  try {
    const parsed = new URL(url);
    for (const key of ["Pass", "pass", "password", "motPasse"]) {
      if (parsed.searchParams.has(key)) {
        parsed.searchParams.set(key, "***REDACTED***");
      }
    }
    return parsed.toString();
  } catch {
    return url.replace(/([?&](?:Pass|pass|password|motPasse)=)[^&]*/g, "$1***REDACTED***");
  }
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function extractXmlTag(xml: string, tag: string): string | null {
  const match = xml.match(new RegExp(`<(?:\\w+:)?${tag}\\b[^>]*>([\\s\\S]*?)</(?:\\w+:)?${tag}>`, "i"));
  return match ? decodeXml(match[1]) : null;
}

async function fetchColissimo(
  path: string,
  params: Record<string, unknown> = {}
): Promise<{ res: Response; url: string }> {
  const url = `${BASE_URL}${path}`;
  const searchParams = new URLSearchParams();
  
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      searchParams.append(key, String(value));
    }
  }

  const fullUrl = searchParams.toString() ? `${url}?${searchParams.toString()}` : url;
  
  const debugParams = { ...params } as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(debugParams, "Pass")) {
    debugParams["Pass"] = "***REDACTED***";
  }

  console.log("[Colissimo] HTTP Request:");
  console.log("  URL:", redactColissimoUrl(fullUrl));
  console.log("  Method: GET");
  console.log("  Params:", JSON.stringify(debugParams));

  const options: RequestInit = {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  };

  const res = await fetch(fullUrl, options);
  const contentType = res.headers.get("content-type") ?? "none";

  const text = await res.clone().text();
  console.log("[Colissimo] Response:");
  console.log("  Status:", res.status);
  console.log("  Content-Type:", contentType);
  console.log("  Body (first 200 chars):", text.slice(0, 200));

  return { res, url };
}

async function postColissimo(
  path: string,
  body: Record<string, unknown>,
  optionsOverride?: { asForm?: boolean; headers?: Record<string, string> }
): Promise<{ res: Response; url: string }> {
  const url = `${BASE_URL}${path}`;

  const debugBody = { ...body } as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(debugBody, "Pass")) {
    debugBody["Pass"] = "***REDACTED***";
  }

  console.log("[Colissimo] HTTP Request:");
  console.log("  URL:", url);
  console.log("  Method: POST");
  console.log("  Body:", JSON.stringify(debugBody));
  if (optionsOverride?.asForm) console.log("  Content-Type: application/x-www-form-urlencoded");

  const headers: Record<string, string> = {
    Accept: "application/json",
    ...optionsOverride?.headers,
  };

  const fetchOptions: RequestInit = {
    method: "POST",
    headers,
  };

  if (optionsOverride?.asForm) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    fetchOptions.body = new URLSearchParams(body as Record<string, string>).toString();
  } else {
    headers["Content-Type"] = "application/json";
    fetchOptions.body = JSON.stringify(body);
  }

  const res = await fetch(url, fetchOptions);
  const contentType = res.headers.get("content-type") ?? "none";

  const text = await res.clone().text();
  console.log("[Colissimo] Response:");
  console.log("  Status:", res.status);
  console.log("  Content-Type:", contentType);
  console.log("  Body (first 200 chars):", text.slice(0, 200));

  return { res, url };
}

async function postColissimoSoap(
  operation: string,
  innerXml: string,
  resultTag: string,
  auth?: Pick<ColissimoConfig, "utilisateur" | "motPasse">
): Promise<{ res: Response; data: any; rawResult?: string }> {
  const headerXml = auth
    ? `<soap:Header><AuthHeader xmlns="http://tempuri.org/">` +
      `<Uilisateur>${escapeXml(auth.utilisateur)}</Uilisateur>` +
      `<Pass>${escapeXml(auth.motPasse)}</Pass>` +
      `</AuthHeader></soap:Header>`
    : "";
  const envelope = `<?xml version="1.0" encoding="utf-8"?>` +
    `<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ` +
    `xmlns:xsd="http://www.w3.org/2001/XMLSchema" ` +
    `xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">` +
    headerXml +
    `<soap:Body><${operation} xmlns="http://tempuri.org/">${innerXml}</${operation}></soap:Body>` +
    `</soap:Envelope>`;

  console.log("[Colissimo] SOAP Request:");
  console.log("  URL:", SOAP_URL);
  console.log("  Operation:", operation);

  const res = await fetch(SOAP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      SOAPAction: `http://tempuri.org/${operation}`,
    },
    body: envelope,
  });

  const text = await res.clone().text();
  console.log("[Colissimo] SOAP Response:");
  console.log("  Status:", res.status);
  console.log("  Body (first 200 chars):", text.slice(0, 200));

  const fault = extractXmlTag(text, "faultstring");
  if (fault) {
    return {
      res,
      data: { result_type: "erreur", result_code: "SOAPFault", result_content: fault },
    };
  }

  const rawResult = extractXmlTag(text, resultTag);
  if (!rawResult) {
    return {
      res,
      data: { error: `Reponse SOAP Colissimo invalide: champ ${resultTag} introuvable.` },
    };
  }

  const trimmed = rawResult.trim();
  if (/unauthorized|non autoris|auth/i.test(trimmed)) {
    return {
      res,
      rawResult,
      data: { result_type: "erreur", result_code: "Unauthorized", result_content: trimmed },
    };
  }

  return { res, rawResult, data: parseMaybeJson(trimmed) };
}

async function parseColissimoResponse<T = any>(res: Response): Promise<T> {
  const text = await res.clone().text();

  if (
    text.trimStart().toLowerCase().startsWith("<!doctype html") ||
    text.trimStart().toLowerCase().startsWith("<html")
  ) {
    console.error("[Colissimo] HTML response received instead of JSON");
    return {
      error: `Colissimo a retourné une page HTML. Vérifiez l'URL API et les identifiants. HTML reçu: ${text.slice(0, 200)}`,
    } as any;
  }

  try {
    return JSON.parse(text);
  } catch {
    return {
      error: `Non-JSON response (${res.status}): ${text.slice(0, 200)}`,
    } as any;
  }
}

function cleanCodeBar(codeBar: string): string {
  return String(codeBar ?? "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\u00A0/g, "")
    .trim();
}

function parseMaybeJson(value: unknown): unknown {
  if (typeof value !== "string") return value;

  const trimmed = value.trim();
  if (!trimmed) return value;

  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function getResultContent(data: any): any {
  return parseMaybeJson(data?.result_content) ?? data;
}

function getApiError(data: any): string | null {
  if (!data) return null;

  const content = getResultContent(data);
  if (data.result_type === "erreur" || data.error) {
    const message = String(
      (typeof content === "string" && content) ||
      content?.message ||
      content?.error ||
      data.error ||
      data.result_code ||
      "Erreur API Colissimo"
    );
    return message.toLowerCase() === "erreur" && data.result_code
      ? String(data.result_code)
      : message;
  }

  return null;
}

function formatColissimoError(error: string | null, status?: number): string | null {
  if (!error && (!status || status < 400)) return null;

  const raw = error ?? `Erreur API: ${status}`;
  const normalized = raw.toLowerCase();

  if (
    status === 401 ||
    normalized.includes("unauthorized") ||
    normalized.includes("non autoris") ||
    normalized.includes("auth")
  ) {
    return "Identifiants ou droits API Colissimo refuses pour cette operation. Verifiez Utilisateur/Mot de passe dans Parametres > Colissimo, puis lancez Tester connexion.";
  }

  if (normalized === "erreur" || normalized.includes("erreur_demande_incorrecte")) {
    return "Colissimo a refuse la demande pour ce colis. Verifiez que le code barre existe, qu'il est rattache a ce compte Colissimo, et que l'acces API getColis/ListColis est active.";
  }

  return raw;
}

function getColisRecord(data: any, codeBar: string): any {
  const content = getResultContent(data);
  const list = Array.isArray(content)
    ? content
    : Array.isArray(content?.colis)
      ? content.colis
      : Array.isArray(content?.list)
        ? content.list
        : Array.isArray(content?.data)
          ? content.data
          : null;

  if (list) {
    return list.find((item: any) =>
      [item?.code, item?.codeBar, item?.code_barre, item?.barcode]
        .map((value) => String(value ?? ""))
        .includes(codeBar)
    ) ?? list[0] ?? {};
  }

  return content ?? data;
}

function getFirstValue(record: any, keys: string[]): unknown {
  for (const key of keys) {
    const value = record?.[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

function toNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  return parseFloat(String(value ?? "0").replace(",", ".")) || 0;
}

function toNullableString(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  return String(value);
}

function mapColisDetailsRecord(record: any, fallbackCodeBar: string): ColissimoColisDetails {
  const etat = String(getFirstValue(record, ["etat", "Etat", "status", "Status", "statut", "Statut"]) ?? "");
  const prix = toNumber(getFirstValue(record, ["prix", "Prix", "amount", "montant", "Montant"]));
  const fraisLivraison = toNumber(getFirstValue(record, [
    "frais_livraison",
    "fraisLivraison",
    "FraisLivraison",
    "deliveryFee",
  ]));
  const fraisRetour = toNumber(getFirstValue(record, [
    "frais_retour",
    "fraisRetour",
    "FraisRetour",
    "returnFee",
  ]));

  return {
    codeBar: String(getFirstValue(record, [
      "code",
      "codeBar",
      "CodeBar",
      "code_barre",
      "CodeBarre",
      "barcode",
    ]) ?? fallbackCodeBar),
    reference: String(getFirstValue(record, ["reference", "Reference", "ref", "Ref"]) ?? ""),
    client: String(getFirstValue(record, ["client", "Client", "nom", "Nom", "customerName"]) ?? ""),
    tel1: String(getFirstValue(record, ["tel1", "Tel1", "tel", "Tel", "telephone", "Telephone", "phone"]) ?? ""),
    adresse: String(getFirstValue(record, ["adresse", "Adresse", "address", "Address"]) ?? ""),
    ville: String(getFirstValue(record, ["ville", "Ville", "city", "City"]) ?? ""),
    gouvernorat: String(getFirstValue(record, ["gouvernorat", "Gouvernorat", "governorate"]) ?? ""),
    prix,
    fraisLivraison,
    fraisRetour,
    etat,
    mappedStatus: mapColissimoStatus(etat),
    numPaiement: toNullableString(getFirstValue(record, [
      "num_paiement",
      "numPaiement",
      "NumPaiement",
      "paymentNumber",
    ])),
    dateCreation: toNullableString(getFirstValue(record, ["date_creation", "dateCreation", "DateCreation", "date"])),
    dateLivraison: toNullableString(getFirstValue(record, ["date_livraison", "dateLivraison", "DateLivraison"])),
    dateEnlevement: toNullableString(getFirstValue(record, ["date_enlevement", "dateEnlevement", "DateEnlevement"])),
    urlEtiquette: toNullableString(getFirstValue(record, ["url_etiquette", "urlEtiquette", "UrlEtiquette", "url"])),
  };
}

async function getColisDetailsViaSoap(
  config: ColissimoConfig,
  codeBar: string
): Promise<{ success: boolean; details?: ColissimoColisDetails; error?: string }> {
  const cleanedCodeBar = cleanCodeBar(codeBar);
  const innerXml = `<code_barre>${escapeXml(cleanedCodeBar)}</code_barre>`;

  const { res, data } = await postColissimoSoap("getColis", innerXml, "getColisResult", config);
  const errMsg = formatColissimoError(getApiError(data), res.status);
  if (errMsg) return { success: false, error: errMsg };
  if (typeof data === "string" && data.trim().toLowerCase() === "erreur") {
    return { success: false, error: formatColissimoError(data, res.status) ?? data };
  }

  const colis = getColisRecord(data, cleanedCodeBar);
  if (!colis || typeof colis === "string") {
    return {
      success: false,
      error: typeof colis === "string" && colis.trim()
        ? formatColissimoError(colis, res.status) ?? colis
        : "Colis non trouve",
    };
  }

  return {
    success: true,
    details: mapColisDetailsRecord(colis, cleanedCodeBar),
  };
}

async function getColisDetailsListViaSoap(
  config: ColissimoConfig,
  codeBars: string[]
): Promise<{ success: boolean; colis: ColissimoColisDetails[]; errors: string[] }> {
  const colis: ColissimoColisDetails[] = [];
  const errors: string[] = [];

  for (const codeBar of codeBars) {
    const result = await getColisDetailsViaSoap(config, codeBar);
    if (result.success && result.details) {
      colis.push(result.details);
    } else {
      errors.push(result.error || `${codeBar}: Erreur API Colissimo`);
    }
  }

  return { success: colis.length > 0 && errors.length === 0, colis, errors };
}

export interface ColissimoColisPayload {
  reference: string;
  client: string;
  adresse: string;
  code_postal: string;
  nb_pieces: number;
  prix: number;
  tel1: string;
  tel2?: string;
  designation: string;
  commentaire?: string;
  type: "VO" | "VM" | "GV" | "EXP";
  echange: 0 | 1;
}

export interface ColissimoResponse {
  success: boolean;
  result_type?: string;
  result_code?: string;
  error?: string;
  codeBar?: string;
  message?: string;
}

export interface ColissimoConfig {
  id: string;
  utilisateur: string;
  motPasse: string;
  codeBar?: string | null;
  codeBar2?: string | null;
  statutColissimo?: string | null;
  lastSyncAt?: Date | null;
  manifesteUrl?: string | null;
  isActive: boolean;
  teamId: string;
  lastTested?: Date | null;
  lastError?: string | null;
}

export function mapColissimoStatus(raw: string): string {
  return mapColissimoStatusStr(raw);
}

export async function getColissimoConfig(teamId: string): Promise<ColissimoConfig | null> {
  const config = await prisma.colissimoIntegration.findUnique({
    where: { teamId },
  });
  if (!config || !config.isActive) return null;
  return {
    ...config,
    utilisateur: config.utilisateur.trim(),
    motPasse: config.motPasse.trim(),
  } as ColissimoConfig;
}

export async function saveColissimoConfig(
  teamId: string,
  utilisateur: string,
  motPasse: string
): Promise<{ success: boolean; message: string }> {
  try {
    const cleanUtilisateur = utilisateur.trim();
    const cleanMotPasse = motPasse.trim();

    await prisma.colissimoIntegration.upsert({
      where: { teamId },
      update: { utilisateur: cleanUtilisateur, motPasse: cleanMotPasse, isActive: true },
      create: { teamId, utilisateur: cleanUtilisateur, motPasse: cleanMotPasse, isActive: true },
    });
    return { success: true, message: "Configuration Colissimo enregistrée." };
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : "Erreur lors de l'enregistrement",
    };
  }
}

export async function deleteColissimoConfig(
  teamId: string
): Promise<{ success: boolean; message: string }> {
  try {
    await prisma.colissimoIntegration.delete({ where: { teamId } });
    return { success: true, message: "Configuration Colissimo supprimée." };
  } catch {
    return { success: false, message: "Erreur lors de la suppression." };
  }
}

export async function testColissimoConnection(
  teamId: string
): Promise<{ success: boolean; message: string }> {
  const config = await getColissimoConfig(teamId);
  if (!config) {
    return { success: false, message: "Configuration Colissimo non trouvée." };
  }

  try {
    const { res } = await fetchColissimo("/StColis/listVilles", {
      Utilisateur: config.utilisateur,
      Pass: config.motPasse,
    });

    if (!res.ok) {
      const data = await parseColissimoResponse(res);
      const error = formatColissimoError(getApiError(data), res.status) ?? `Erreur API: ${res.status}`;
      await prisma.colissimoIntegration.update({
        where: { teamId },
        data: { lastTested: new Date(), lastError: error },
      });
      return { success: false, message: error };
    }

    const data = await parseColissimoResponse(res);
    console.log("[Colissimo] Test response:", JSON.stringify(data));

    const errMsg = getApiError(data);
    const formattedError = errMsg ? formatColissimoError(errMsg, res.status) : null;
    if (formattedError) {
      await prisma.colissimoIntegration.update({
        where: { teamId },
        data: { lastTested: new Date(), lastError: formattedError },
      });
      return { success: false, message: formattedError };
    }

    await prisma.colissimoIntegration.update({
      where: { teamId },
      data: { lastTested: new Date(), lastError: null },
    });

    return { success: true, message: "Connexion Colissimo OK!" };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Erreur réseau";
    await prisma.colissimoIntegration.update({
      where: { teamId },
      data: { lastTested: new Date(), lastError: errorMsg },
    });
    return { success: false, message: errorMsg };
  }
}

export async function ajouterColis(
  teamId: string,
  payload: ColissimoColisPayload
): Promise<ColissimoResponse> {
  const config = await getColissimoConfig(teamId);
  if (!config) {
    return { success: false, error: "Colissimo non configuré" };
  }

  try {
    const { res } = await postColissimo("/StColis/AjouterColis", {
      Utilisateur: config.utilisateur,
      Pass: config.motPasse,
      reference: payload.reference,
      client: payload.client,
      adresse: payload.adresse,
      code_postal: payload.code_postal,
      nb_pieces: payload.nb_pieces,
      prix: payload.prix,
      tel1: payload.tel1,
      tel2: payload.tel2 || "",
      designation: payload.designation,
      commentaire: payload.commentaire || "",
      type: payload.type,
      echange: payload.echange,
    });

    const data = await parseColissimoResponse(res);
    console.log("[Colissimo] AjouterColis response:", JSON.stringify(data));

    if (!res.ok) {
      return { success: false, error: data.error || "Erreur API" };
    }

    if (data.result_type === "success" || data.result_type === "partial_success") {
      return {
        success: true,
        codeBar: data.codeBar || data.code_barre,
        message: data.message || "Colis ajouté avec succès",
      };
    }

    return {
      success: false,
      error: data.error || data.result_code || "Erreur lors de l'ajout du colis",
    };
  } catch (err) {
    console.error("[Colissimo] AjouterColis error:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Erreur réseau",
    };
  }
}

export async function AjouterMultipleColis(
  teamId: string,
  colisList: ColissimoColisPayload[]
): Promise<{
  success: boolean;
  successCount: number;
  errors: string[];
  result_code?: string;
}> {
  const config = await getColissimoConfig(teamId);
  if (!config) {
    return { success: false, successCount: 0, errors: ["Colissimo non configuré"] };
  }

  if (colisList.length > 50) {
    return { success: false, successCount: 0, errors: ["Maximum 50 colis par requête"] };
  }

  try {
    const { res } = await postColissimo("/StColis/AjoutMultiple", {
      Utilisateur: config.utilisateur,
      Pass: config.motPasse,
      colis: colisList,
    });

    const data = await parseColissimoResponse(res);
    console.log("[Colissimo] AjoutMultiple response:", JSON.stringify(data));

    if (!res.ok) {
      return { success: false, successCount: 0, errors: [data.error || "Erreur API"] };
    }

    return {
      success: data.result_type === "success",
      successCount: data.success_count || 0,
      errors: data.errors || [],
      result_code: data.result_code,
    };
  } catch (err) {
    console.error("[Colissimo] AjoutMultiple error:", err);
    return {
      success: false,
      successCount: 0,
      errors: [err instanceof Error ? err.message : "Erreur"],
    };
  }
}

export interface ColissimoColisDetails {
  codeBar: string;
  reference: string;
  client: string;
  tel1: string;
  adresse: string;
  ville: string;
  gouvernorat: string;
  prix: number;
  fraisLivraison: number;
  fraisRetour: number;
  etat: string;
  mappedStatus: string;
  numPaiement: string | null;
  dateCreation: string | null;
  dateLivraison: string | null;
  dateEnlevement: string | null;
  urlEtiquette: string | null;
}

// getColis : API JSON v1 selon la documentation Colissimo
export async function getColis(
  teamId: string,
  codeBar: string
): Promise<{
  success: boolean;
  colis?: {
    codeBar: string;
    reference: string;
    client: string;
    statut: string;
    date: string;
    url?: string;
  };
  error?: string;
}> {
  const config = await getColissimoConfig(teamId);
  if (!config) {
    return { success: false, error: "Colissimo non configuré" };
  }

  try {
    const cleanedCodeBar = cleanCodeBar(codeBar);

    const { res } = await postColissimo("/StColis/getColis", {
      Utilisateur: config.utilisateur,
      Pass: config.motPasse,
      codeBar: cleanedCodeBar,
    }, { asForm: true });

    const data = await parseColissimoResponse(res);
    console.log("[Colissimo] getColis response:", JSON.stringify(data));

    const errMsg = formatColissimoError(getApiError(data), res.status);
    if (errMsg) {
      const soapResult = await getColisDetailsViaSoap(config, cleanedCodeBar);
      if (soapResult.success && soapResult.details) {
        return {
          success: true,
          colis: {
            codeBar: soapResult.details.codeBar,
            reference: soapResult.details.reference,
            client: soapResult.details.client,
            statut: soapResult.details.etat,
            date: soapResult.details.dateCreation || new Date().toISOString(),
            url: soapResult.details.urlEtiquette || undefined,
          },
        };
      }
      return { success: false, error: soapResult.error || errMsg };
    }

    const colis = getColisRecord(data, cleanedCodeBar);

    return {
      success: true,
      colis: {
        codeBar: colis.code || colis.codeBar || colis.code_barre || cleanedCodeBar,
        reference: colis.reference || "",
        client: colis.client || "",
        statut: colis.etat || colis.status || colis.statut || "",
        date: colis.date_creation || colis.date || new Date().toISOString(),
        url: colis.url_etiquette || colis.url,
      },
    };
  } catch (err) {
    console.error("[Colissimo] getColis error:", err);
    return { success: false, error: err instanceof Error ? err.message : "Erreur" };
  }
}

// getColisDetails : mapping complet pour import commandes + paiements
export async function getColisDetails(
  teamId: string,
  codeBar: string
): Promise<{ success: boolean; details?: ColissimoColisDetails; error?: string }> {
  const config = await getColissimoConfig(teamId);
  if (!config) return { success: false, error: "Colissimo non configuré" };

  try {
    const cleanedCodeBar = cleanCodeBar(codeBar);

    const { res } = await postColissimo("/StColis/getColis", {
      Utilisateur: config.utilisateur,
      Pass: config.motPasse,
      codeBar: cleanedCodeBar,
    }, { asForm: true });

    const data = await parseColissimoResponse(res);
    console.log("[Colissimo] getColisDetails response:", JSON.stringify(data));

    // Gérer les erreurs API Colissimo (result_type: "erreur")
    const errMsg = formatColissimoError(getApiError(data), res.status);
    if (errMsg) {
      const soapResult = await getColisDetailsViaSoap(config, cleanedCodeBar);
      if (soapResult.success) return soapResult;
      return { success: false, error: soapResult.error || errMsg };
    }

    const colis = getColisRecord(data, cleanedCodeBar);

    return {
      success: true,
      details: mapColisDetailsRecord(colis, cleanedCodeBar),
    };
  } catch (err) {
    console.error("[Colissimo] getColisDetails error:", err);
    return { success: false, error: err instanceof Error ? err.message : "Erreur" };
  }
}

// listColis : import bulk via API v2
export async function listColis(
  teamId: string,
  codeBars: string[]
): Promise<{ success: boolean; colis: ColissimoColisDetails[]; errors: string[] }> {
  const config = await getColissimoConfig(teamId);
  if (!config) return { success: false, colis: [], errors: ["Colissimo non configuré"] };

  try {
    const url = `${BASE_URL_V2}/StColis/ListColis`;

    const cleanedCodeBars = codeBars.map(cleanCodeBar).filter(Boolean);
    const joinedCodeBars = cleanedCodeBars.join(";");
    const debugBody = {
      Utilisateur: config.utilisateur,
      Pass: "***REDACTED***",
      codeBar: joinedCodeBars,
    };
    console.log("[Colissimo] listColis request:", JSON.stringify(debugBody));

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        Utilisateur: config.utilisateur,
        Pass: config.motPasse,
        codeBar: joinedCodeBars,
      }),
    });

    const text = await res.clone().text();
    console.log("[Colissimo] listColis response (first 500):", text.slice(0, 500));

    if (text.trimStart().toLowerCase().startsWith("<!doctype html") ||
        text.trimStart().toLowerCase().startsWith("<html")) {
      return {
        success: false,
        colis: [],
        errors: ["Colissimo retourne une page Login HTML : vérifiez URL, méthode POST, Utilisateur/Pass"],
      };
    }

    let data: any;
    try { data = JSON.parse(text); } catch {
      return { success: false, colis: [], errors: [`Réponse non-JSON: ${text.slice(0, 200)}`] };
    }

    // Gérer les erreurs API Colissimo
    const errMsg = formatColissimoError(getApiError(data), res.status);
    if (errMsg) {
      console.error("[Colissimo] listColis API error:", errMsg);
      const fallback = await getColisDetailsListViaSoap(config, cleanedCodeBars);
      return fallback.colis.length > 0 ? fallback : { success: false, colis: [], errors: [errMsg] };
    }

    const content = getResultContent(data);
    const list: any[] = Array.isArray(content) ? content : (content.colis || content.list || content.data || []);
    const errors: string[] = data.errors || content.errors || [];

    const colis: ColissimoColisDetails[] = list.map((d: any) => mapColisDetailsRecord(d, ""));

    return { success: true, colis, errors };
  } catch (err) {
    console.error("[Colissimo] listColis error:", err);
    return { success: false, colis: [], errors: [err instanceof Error ? err.message : "Erreur"] };
  }
}

export async function syncColisStatus(
  teamId: string,
  orders: Array<{ id: string; trackingNumber: string }>
): Promise<{
  synced: number;
  failed: number;
  errors: string[];
}> {
  let synced = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const order of orders) {
    if (!order.trackingNumber) continue;

    try {
      const result = await getColis(teamId, order.trackingNumber);

      if (result.success && result.colis) {
        const mappedStatus = mapColissimoStatus(result.colis.statut);

        await prisma.order.update({
          where: { id: order.id },
          data: {
            status: mappedStatus,
            shippingProvider: "COLISSIMO",
          },
        });

        synced++;
      } else {
        failed++;
        errors.push(`${order.trackingNumber}: ${result.error}`);
      }
    } catch (err) {
      failed++;
      errors.push(
        `${order.trackingNumber}: ${err instanceof Error ? err.message : "Erreur"}`
      );
    }
  }

  return { synced, failed, errors };
}

export async function ListVilles(
  teamId: string
): Promise<{
  success: boolean;
  villes?: Array<{ code: string; libelle: string }>;
  error?: string;
}> {
  const config = await getColissimoConfig(teamId);
  if (!config) {
    return { success: false, error: "Colissimo non configuré" };
  }

  try {
    const { res } = await fetchColissimo("/StColis/listVilles", {
      Utilisateur: config.utilisateur,
      Pass: config.motPasse,
    });

    const data = await parseColissimoResponse(res);

    if (!res.ok || data.error) {
      return { success: false, error: data.error || "Erreur API" };
    }

    return {
      success: true,
      villes: data.villes || data.list || [],
    };
  } catch (err) {
    console.error("[Colissimo] ListVilles error:", err);
    return { success: false, error: err instanceof Error ? err.message : "Erreur" };
  }
}

export async function supprimerColis(
  teamId: string,
  codeBar: string
): Promise<{
  success: boolean;
  error?: string;
}> {
  const config = await getColissimoConfig(teamId);
  if (!config) {
    return { success: false, error: "Colissimo non configuré" };
  }

  try {
    const { res } = await postColissimo("/StColis/supprimerColis", {
      Utilisateur: config.utilisateur,
      Pass: config.motPasse,
      codeBar,
    });

    const data = await parseColissimoResponse(res);
    console.log("[Colissimo] supprimerColis response:", JSON.stringify(data));

    if (!res.ok || data.error) {
      return { success: false, error: data.error || data.result_code || "Erreur API" };
    }

    return { success: true };
  } catch (err) {
    console.error("[Colissimo] supprimerColis error:", err);
    return { success: false, error: err instanceof Error ? err.message : "Erreur" };
  }
}

export async function modifierColis(
  teamId: string,
  codeBar: string,
  updates: Partial<ColissimoColisPayload>
): Promise<{
  success: boolean;
  error?: string;
}> {
  const config = await getColissimoConfig(teamId);
  if (!config) {
    return { success: false, error: "Colissimo non configuré" };
  }

  try {
    const { res } = await postColissimo("/StColis/modifierColis", {
      Utilisateur: config.utilisateur,
      Pass: config.motPasse,
      codeBar,
      ...updates,
    });

    const data = await parseColissimoResponse(res);
    console.log("[Colissimo] modifierColis response:", JSON.stringify(data));

    if (!res.ok || data.error) {
      return { success: false, error: data.error || data.result_code || "Erreur API" };
    }

    return { success: true };
  } catch (err) {
    console.error("[Colissimo] modifierColis error:", err);
    return { success: false, error: err instanceof Error ? err.message : "Erreur" };
  }
}

export async function demanderEnlevement(
  teamId: string
): Promise<{
  success: boolean;
  manifesteUrl?: string;
  error?: string;
}> {
  const config = await getColissimoConfig(teamId);
  if (!config) {
    return { success: false, error: "Colissimo non configuré" };
  }

  try {
    const { res } = await postColissimo("/StColis/demanderEnlevement", {
      Utilisateur: config.utilisateur,
      Pass: config.motPasse,
    });

    const data = await parseColissimoResponse(res);
    console.log("[Colissimo] demanderEnlevement response:", JSON.stringify(data));

    if (!res.ok || data.error) {
      return { success: false, error: data.error || data.result_code || "Erreur API" };
    }

    return {
      success: true,
      manifesteUrl: data.url_manifeste || data.url,
    };
  } catch (err) {
    console.error("[Colissimo] demanderEnlevement error:", err);
    return { success: false, error: err instanceof Error ? err.message : "Erreur" };
  }
}
