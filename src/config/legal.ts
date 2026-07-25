// Legal & Safety Center configuration.
// Owner must fill these in before public commercial launch. Every /legal page
// reads from here and shows a red admin banner until ENTITY_CONFIGURED=true.
//
// These are NOT attorney-reviewed drafts. Treat as beta placeholders.

export const LEGAL_CONFIG = {
  APP_NAME: "DRIP", // internal beta name; trademark clearance pending
  LEGAL_OWNER: "[LEGAL OWNER]",
  SUPPORT_EMAIL: "[SUPPORT EMAIL]",
  JURISDICTION: "[STATE/COUNTRY]",
  EFFECTIVE_DATE: "[EFFECTIVE DATE]",
  MIN_AGE: 18,
  // Flip to true only after every placeholder above is set to a real value AND
  // the copy has been reviewed by counsel. Controls launch-ready banner + admin gates.
  ENTITY_CONFIGURED: false,
  // Feature flags — reflect what is actually shipped in beta.
  BETA_FEATURES: {
    marketplace: false,
    payments: false,
    shipping: false,
    strangerMessaging: false,
    publicOutfits: true, // opt-in per outfit, private by default
  },
} as const;

export function isLegalReady(): boolean {
  const c = LEGAL_CONFIG;
  return (
    c.ENTITY_CONFIGURED &&
    !c.LEGAL_OWNER.startsWith("[") &&
    !c.SUPPORT_EMAIL.startsWith("[") &&
    !c.JURISDICTION.startsWith("[") &&
    !c.EFFECTIVE_DATE.startsWith("[")
  );
}
