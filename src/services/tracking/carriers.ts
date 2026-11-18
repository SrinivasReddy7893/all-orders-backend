/**
 * Courier registry: one entry per carrier / shipping aggregator, used to
 *   - recognise a tracking ID typed by the user (identifyTrackingId)
 *   - recognise the courier from a shipping email (detectShipment)
 *   - build a link to the courier's public tracking page.
 *
 * ID formats are split into `certainIds` (unique format → we name the courier)
 * and `possibleIds` (plain numbers many couriers share → only a candidate).
 * Aggregators (Shiprocket, KwikShip, …) hand parcels to a courier but have
 * their own public tracking pages, so they are listed like couriers.
 *
 * Tracking-page templates: KwikShip is confirmed from real emails; the others
 * are the couriers' publicly documented pages — re-check if one stops working.
 */

export type Carrier = { code: string; name: string };

type CarrierDef = Carrier & {
  region: "IN" | "US" | "GLOBAL";
  certainIds?: RegExp[];
  possibleIds?: RegExp[];
  textPatterns?: RegExp[];
  linkHosts?: RegExp[];
  trackingUrl?: (id: string) => string;
};

const enc = encodeURIComponent;

const CARRIERS: CarrierDef[] = [
  // ── India: aggregators ──
  { code: "SHIPROCKET", name: "Shiprocket", region: "IN", textPatterns: [/\bship ?rocket\b/i], linkHosts: [/shiprocket\.(in|co)/i], trackingUrl: (id) => `https://shiprocket.co/tracking/${enc(id)}` },
  { code: "KWIKSHIP", name: "KwikShip (GoKwik)", region: "IN", textPatterns: [/\bkwik ?ship\b/i, /\bgokwik\b/i], linkHosts: [/gokwik\.co/i], trackingUrl: (id) => `https://api.gokwik.co/kwikship/track/${enc(id)}` },
  { code: "NIMBUSPOST", name: "NimbusPost", region: "IN", textPatterns: [/\bnimbus ?post\b/i], linkHosts: [/nimbuspost\.com/i] },
  { code: "SHIPWAY", name: "Shipway", region: "IN", textPatterns: [/\bshipway\b/i], linkHosts: [/shipway\.(in|com)/i] },
  { code: "PICKRR", name: "Pickrr", region: "IN", textPatterns: [/\bpickrr\b/i], linkHosts: [/pickrr\.com/i] },

  // ── India: couriers ──
  { code: "EKART", name: "Ekart", region: "IN", certainIds: [/^(FMP[CPR]|FKMP|MYSP|MYEP)\d{9,12}$/], textPatterns: [/\be-?kart\b/i], linkHosts: [/ekartlogistics\.com/i], trackingUrl: (id) => `https://ekartlogistics.com/shipmenttrack/${enc(id)}` },
  { code: "SHADOWFAX", name: "Shadowfax", region: "IN", certainIds: [/^SF\d{9,12}[A-Z]{0,3}$/], textPatterns: [/\bshadow ?fax\b/i], linkHosts: [/shadowfax\.in/i] },
  { code: "DELHIVERY", name: "Delhivery", region: "IN", possibleIds: [/^\d{13,14}$/], textPatterns: [/\bdelhivery\b/i], linkHosts: [/delhivery\.com/i], trackingUrl: (id) => `https://www.delhivery.com/track/package/${enc(id)}` },
  { code: "BLUEDART", name: "Blue Dart", region: "IN", possibleIds: [/^\d{11}$/], textPatterns: [/\bblue ?dart\b/i], linkHosts: [/bluedart\.com/i], trackingUrl: (id) => `https://www.bluedart.com/web/guest/trackdartresult?trackFor=0&trackNo=${enc(id)}` },
  { code: "XPRESSBEES", name: "XpressBees", region: "IN", possibleIds: [/^\d{14,16}$/], textPatterns: [/\bxpress ?bees\b/i], linkHosts: [/xpressbees\.com/i], trackingUrl: (id) => `https://www.xpressbees.com/shipment/tracking?awbNo=${enc(id)}` },
  { code: "ECOM_EXPRESS", name: "Ecom Express", region: "IN", possibleIds: [/^\d{9,10}$/], textPatterns: [/\becom ?express\b/i], linkHosts: [/ecomexpress\.in/i], trackingUrl: (id) => `https://ecomexpress.in/tracking/?awb_field=${enc(id)}` },
  { code: "DTDC", name: "DTDC", region: "IN", possibleIds: [/^[A-Z]\d{8}$/], textPatterns: [/\bdtdc\b/i], linkHosts: [/dtdc\.(in|com)/i] },
  { code: "INDIA_POST", name: "India Post", region: "IN", certainIds: [/^[A-Z]{2}\d{9}IN$/], textPatterns: [/\bindia ?post\b/i, /\bspeed ?post\b/i], linkHosts: [/indiapost\.gov\.in/i] },
  { code: "ELASTICRUN", name: "ElasticRun", region: "IN", textPatterns: [/\belastic ?run\b/i] },
  { code: "SMARTR", name: "Smartr Logistics", region: "IN", textPatterns: [/\bsmartr\b/i] },
  { code: "GATI", name: "Gati", region: "IN", textPatterns: [/\bgati\b/i], linkHosts: [/gati\.com/i] },
  { code: "PROFESSIONAL_COURIERS", name: "The Professional Couriers", region: "IN", textPatterns: [/\bprofessional couriers?\b/i], linkHosts: [/tpcindia\.com/i] },
  { code: "AMAZON_SHIPPING_IN", name: "Amazon Shipping (ATS)", region: "IN", textPatterns: [/\bamazon transportation services\b/i, /\bATS\b/] },
  { code: "TRACKON", name: "Trackon Couriers", region: "IN", textPatterns: [/\btrackon\b/i], linkHosts: [/trackon\.in/i] },
  { code: "SHREE_MARUTI", name: "Shree Maruti Courier", region: "IN", textPatterns: [/\bshree maruti\b/i], linkHosts: [/shreemaruti\.com/i] },
  { code: "SHREE_ANJANI", name: "Shree Anjani Courier", region: "IN", textPatterns: [/\bshree anjani\b/i] },
  { code: "SHREE_TIRUPATI", name: "Shree Tirupati Courier", region: "IN", textPatterns: [/\bshree tirupati\b/i] },
  { code: "MADHUR", name: "Madhur Couriers", region: "IN", textPatterns: [/\bmadhur couriers?\b/i] },
  { code: "SAFEXPRESS", name: "Safexpress", region: "IN", textPatterns: [/\bsafexpress\b/i], linkHosts: [/safexpress\.com/i] },
  { code: "SPOTON", name: "Spoton Logistics", region: "IN", textPatterns: [/\bspoton\b/i] },
  { code: "RIVIGO", name: "Rivigo", region: "IN", textPatterns: [/\brivigo\b/i] },
  { code: "OM_LOGISTICS", name: "OM Logistics", region: "IN", textPatterns: [/\bom logistics\b/i] },
  { code: "ITHINK", name: "iThink Logistics", region: "IN", textPatterns: [/\bithink logistics\b/i], linkHosts: [/ithinklogistics\.com/i] },
  { code: "SHIPYAARI", name: "Shipyaari", region: "IN", textPatterns: [/\bshipyaari\b/i], linkHosts: [/shipyaari\.com/i] },
  { code: "VAMASHIP", name: "Vamaship", region: "IN", textPatterns: [/\bvamaship\b/i], linkHosts: [/vamaship\.com/i] },
  { code: "ESHIPZ", name: "eShipz", region: "IN", textPatterns: [/\beshipz\b/i], linkHosts: [/eshipz\.com/i] },
  { code: "CLICKPOST", name: "ClickPost", region: "IN", textPatterns: [/\bclickpost\b/i], linkHosts: [/clickpost\.(in|ai)/i] },
  // Hyperlocal / quick commerce delivery partners
  { code: "DUNZO", name: "Dunzo", region: "IN", textPatterns: [/\bdunzo\b/i] },
  { code: "PORTER", name: "Porter", region: "IN", textPatterns: [/\bporter\.in\b/i], linkHosts: [/porter\.in/i] },
  { code: "BORZO", name: "Borzo (WeFast)", region: "IN", textPatterns: [/\bborzo\b/i, /\bwefast\b/i], linkHosts: [/borzo\.com/i] },
  { code: "LOADSHARE", name: "LoadShare", region: "IN", textPatterns: [/\bloadshare\b/i] },

  // ── USA / Canada ──
  { code: "UPS", name: "UPS", region: "US", certainIds: [/^1Z[0-9A-Z]{16}$/], textPatterns: [/\bUPS\b/], linkHosts: [/ups\.com/i], trackingUrl: (id) => `https://www.ups.com/track?tracknum=${enc(id)}` },
  { code: "USPS", name: "USPS", region: "US", certainIds: [/^9[2-5]\d{20}$/, /^[A-Z]{2}\d{9}US$/], textPatterns: [/\bUSPS\b/, /\bunited states postal\b/i], linkHosts: [/usps\.com/i], trackingUrl: (id) => `https://tools.usps.com/go/TrackConfirmAction?tLabels=${enc(id)}` },
  { code: "FEDEX", name: "FedEx", region: "US", possibleIds: [/^\d{12}$/, /^\d{15}$/], textPatterns: [/\bfed ?ex\b/i], linkHosts: [/fedex\.com/i], trackingUrl: (id) => `https://www.fedex.com/fedextrack/?trknbr=${enc(id)}` },
  { code: "AMAZON", name: "Amazon Logistics", region: "US", certainIds: [/^TBA\d{12}$/], textPatterns: [/\bamazon (logistics|shipping)\b/i] },
  { code: "ONTRAC", name: "OnTrac", region: "US", certainIds: [/^[CD]\d{14}$/], textPatterns: [/\bontrac\b/i], linkHosts: [/ontrac\.com/i], trackingUrl: (id) => `https://www.ontrac.com/tracking/?number=${enc(id)}` },
  { code: "LASERSHIP", name: "LaserShip (OnTrac)", region: "US", certainIds: [/^1LS[0-9A-Z]{10,}$/, /^LX\d{8,}$/], textPatterns: [/\blasership\b/i] },
  { code: "DHL_ECOMMERCE", name: "DHL eCommerce", region: "US", certainIds: [/^GM\d{16,18}$/], textPatterns: [/\bDHL e-?commerce\b/i] },
  { code: "VEHO", name: "Veho", region: "US", textPatterns: [/\bveho\b/i], linkHosts: [/shipveho\.com/i] },
  { code: "SPEEDEE", name: "Spee-Dee Delivery", region: "US", textPatterns: [/\bspee-?dee\b/i], linkHosts: [/speedeedelivery\.com/i] },
  { code: "GLS_US", name: "GLS US", region: "US", textPatterns: [/\bGLS\b/], linkHosts: [/gls-us\.com/i] },
  { code: "UNIUNI", name: "UniUni", region: "US", textPatterns: [/\buniuni\b/i], linkHosts: [/uniuni\.com/i] },
  { code: "PUROLATOR", name: "Purolator", region: "US", textPatterns: [/\bpurolator\b/i], linkHosts: [/purolator\.com/i] },
  { code: "CANADA_POST", name: "Canada Post", region: "US", certainIds: [/^[A-Z]{2}\d{9}CA$/], textPatterns: [/\bcanada post\b/i], linkHosts: [/canadapost/i] },

  // ── Global ──
  { code: "DHL", name: "DHL Express", region: "GLOBAL", possibleIds: [/^\d{10}$/], textPatterns: [/\bDHL\b/], linkHosts: [/dhl\.com/i], trackingUrl: (id) => `https://www.dhl.com/global-en/home/tracking/tracking-express.html?tracking-id=${enc(id)}` },
  { code: "ARAMEX", name: "Aramex", region: "GLOBAL", textPatterns: [/\baramex\b/i], linkHosts: [/aramex\.com/i] },
  { code: "TNT", name: "TNT", region: "GLOBAL", textPatterns: [/\bTNT\b/], linkHosts: [/tnt\.com/i] },
  { code: "SF_EXPRESS", name: "SF Express", region: "GLOBAL", certainIds: [/^SF\d{12,13}$/], textPatterns: [/\bSF Express\b/i], linkHosts: [/sf-express\.com/i] },
  { code: "CAINIAO", name: "Cainiao", region: "GLOBAL", textPatterns: [/\bcainiao\b/i], linkHosts: [/cainiao\.com/i] },
  { code: "YUNEXPRESS", name: "YunExpress", region: "GLOBAL", certainIds: [/^YT\d{16}$/], textPatterns: [/\byunexpress\b/i] },
  { code: "YANWEN", name: "Yanwen", region: "GLOBAL", textPatterns: [/\byanwen\b/i] },
  { code: "FOURPX", name: "4PX", region: "GLOBAL", textPatterns: [/\b4PX\b/] },
  { code: "ROYAL_MAIL", name: "Royal Mail", region: "GLOBAL", certainIds: [/^[A-Z]{2}\d{9}GB$/], textPatterns: [/\broyal mail\b/i], linkHosts: [/royalmail\.com/i] },
  { code: "CHINA_POST", name: "China Post", region: "GLOBAL", certainIds: [/^[A-Z]{2}\d{9}CN$/], textPatterns: [/\bchina post\b/i] },
  { code: "AUSTRALIA_POST", name: "Australia Post", region: "GLOBAL", certainIds: [/^[A-Z]{2}\d{9}AU$/], textPatterns: [/\baustralia post\b/i], linkHosts: [/auspost\.com\.au/i] },
  { code: "JAPAN_POST", name: "Japan Post", region: "GLOBAL", certainIds: [/^[A-Z]{2}\d{9}JP$/], textPatterns: [/\bjapan post\b/i] },
  // Any other UPU S10 postal ID (2 letters, 9 digits, 2-letter country). Must stay last.
  { code: "POSTAL", name: "National postal service", region: "GLOBAL", certainIds: [/^[A-Z]{2}\d{9}[A-Z]{2}$/] },
];

const publicCarrier = ({ code, name }: CarrierDef): Carrier => ({ code, name });
const byCode = (code: string) => CARRIERS.find((c) => c.code === code);

export const trackingUrlFor = (carrierCode: string | null, id: string | null): string | null => {
  if (!carrierCode || !id) return null;
  return byCode(carrierCode)?.trackingUrl?.(id) ?? null;
};

/** What a user typed → canonical form: no spaces, uppercase, no leading "#". */
export const normalizeTrackingQuery = (q: string) => q.trim().replace(/^#/, "").replace(/\s+/g, "").toUpperCase();

/**
 * Which courier a tracking ID belongs to, from its format alone.
 * `carrier` is set only when the format is unique to one courier; otherwise
 * `possibleCarriers` lists the couriers that use that format.
 */
export const identifyTrackingId = (rawId: string) => {
  const id = normalizeTrackingQuery(rawId);
  const certain = CARRIERS.find((c) => c.certainIds?.some((p) => p.test(id)));
  const possible = certain ? [] : CARRIERS.filter((c) => c.possibleIds?.some((p) => p.test(id)));
  return {
    carrier: certain ? publicCarrier(certain) : null,
    possibleCarriers: possible.map(publicCarrier),
    trackingUrl: certain ? trackingUrlFor(certain.code, id) : null,
  };
};

/**
 * Courier and tracking link from a shipping email. Priority:
 *   1. a link in the email that contains the tracking number (exact page)
 *   2. a courier link domain in the email
 *   3. a courier named in the text
 *   4. the tracking number's format
 * Links without the tracking number (personalised redirects) are never stored;
 * the courier's public page is built from the tracking number instead.
 */
const hostOf = (link: string) => {
  try {
    return new URL(link).hostname;
  } catch {
    return ""; // malformed link in an email
  }
};

export const detectShipment = (text: string, links: string[], trackingNumber: string | null) => {
  const exactLink = trackingNumber ? links.find((l) => l.includes(trackingNumber) && hostOf(l)) : undefined;
  const fromLinks = CARRIERS.find((c) => c.linkHosts?.some((h) => links.some((l) => h.test(hostOf(l)))));
  const fromText = CARRIERS.find((c) => c.textPatterns?.some((p) => p.test(text)));
  const fromId = trackingNumber ? byCode(identifyTrackingId(trackingNumber).carrier?.code ?? "") : undefined;

  const exactCarrier = exactLink ? CARRIERS.find((c) => c.linkHosts?.some((h) => h.test(hostOf(exactLink)))) : undefined;
  const carrier = exactCarrier ?? fromLinks ?? fromText ?? fromId ?? null;

  return {
    carrier: carrier ? publicCarrier(carrier) : null,
    trackingUrl: exactLink ?? (carrier ? trackingUrlFor(carrier.code, trackingNumber) : null),
  };
};
