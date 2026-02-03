import type { ActionClass, RiskLevel } from "@/lib/db/schema";

export interface ClassificationResult {
  actionClass: ActionClass;
  riskLevel: RiskLevel;
  riskFlags: {
    external_domain: boolean;
    new_recipient: boolean;
    attachment: boolean;
    form_submit: boolean;
    shell_exec: boolean;
    destructive: boolean;
  };
  resource: {
    domain?: string;
    recipientDomain?: string;
    urlHost?: string;
    urlPath?: string;
  };
}

// Patterns for deterministic classification
const EXECUTE_PATTERNS = [
  /exec/i,
  /command/i,
  /script/i,
  /shell/i,
  /bash/i,
  /run/i,
  /terminal/i,
  /spawn/i,
  /system/i,
  /eval/i,
];

const SUBMIT_PATTERNS = [
  /submit/i,
  /confirm/i,
  /apply/i,
  /deploy/i,
  /publish/i,
  /create_pr/i,
  /merge/i,
  /approve/i,
  /finalize/i,
];

const SEND_PATTERNS = [
  /send/i,
  /post/i,
  /notify/i,
  /email/i,
  /message/i,
  /slack/i,
  /tweet/i,
  /dm/i,
  /sms/i,
  /broadcast/i,
];

const TRANSFER_PATTERNS = [
  /payment/i,
  /invoice/i,
  /transfer/i,
  /charge/i,
  /refund/i,
  /payout/i,
  /withdraw/i,
  /deposit/i,
  /stripe/i,
  /billing/i,
];

const WRITE_PATTERNS = [
  /write/i,
  /update/i,
  /delete/i,
  /remove/i,
  /modify/i,
  /edit/i,
  /patch/i,
  /put/i,
  /insert/i,
  /upsert/i,
  /save/i,
];

const DESTRUCTIVE_PATTERNS = [
  /delete/i,
  /remove/i,
  /drop/i,
  /truncate/i,
  /destroy/i,
  /purge/i,
  /wipe/i,
  /reset/i,
  /clear/i,
];

const HTTP_MUTATING_METHODS = ["POST", "PUT", "DELETE", "PATCH"];

/**
 * Extract domain from a URL or email
 */
function extractDomain(value: string): string | undefined {
  try {
    // Try URL first
    if (value.startsWith("http://") || value.startsWith("https://")) {
      const url = new URL(value);
      return url.hostname;
    }
    // Try email
    if (value.includes("@") && !value.includes(" ")) {
      const parts = value.split("@");
      if (parts.length === 2) {
        return parts[1].toLowerCase();
      }
    }
    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * Extract URL components
 */
function extractUrlComponents(
  value: string
): { host: string; path: string } | undefined {
  try {
    if (value.startsWith("http://") || value.startsWith("https://")) {
      const url = new URL(value);
      return { host: url.hostname, path: url.pathname };
    }
    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * Check if domain is external (not localhost or common internal domains)
 */
function isExternalDomain(domain: string | undefined): boolean {
  if (!domain) return false;
  const internal = [
    "localhost",
    "127.0.0.1",
    "0.0.0.0",
    "internal",
    "local",
    "intranet",
  ];
  return !internal.some(
    (i) => domain === i || domain.endsWith(`.${i}`)
  );
}

/**
 * Search for domains/emails in args recursively
 */
function findDomainsInArgs(args: unknown): {
  domains: string[];
  recipientDomains: string[];
  urls: { host: string; path: string }[];
} {
  const domains: string[] = [];
  const recipientDomains: string[] = [];
  const urls: { host: string; path: string }[] = [];

  function search(obj: unknown, key?: string) {
    if (typeof obj === "string") {
      const domain = extractDomain(obj);
      if (domain) {
        if (
          key &&
          (key.toLowerCase().includes("to") ||
            key.toLowerCase().includes("recipient") ||
            key.toLowerCase().includes("email"))
        ) {
          recipientDomains.push(domain);
        } else {
          domains.push(domain);
        }
      }
      const urlParts = extractUrlComponents(obj);
      if (urlParts) {
        urls.push(urlParts);
      }
    } else if (Array.isArray(obj)) {
      obj.forEach((item) => search(item, key));
    } else if (obj && typeof obj === "object") {
      Object.entries(obj).forEach(([k, v]) => search(v, k));
    }
  }

  search(args);
  return { domains, recipientDomains, urls };
}

/**
 * Check if args contain attachment indicators
 */
function hasAttachment(args: unknown): boolean {
  const str = JSON.stringify(args).toLowerCase();
  return (
    str.includes("attachment") ||
    str.includes("file") ||
    str.includes("upload") ||
    str.includes("base64")
  );
}

/**
 * Check if args contain form submission indicators
 */
function hasFormSubmit(args: unknown): boolean {
  const str = JSON.stringify(args).toLowerCase();
  return (
    str.includes("form") ||
    str.includes("submit") ||
    str.includes("button") ||
    str.includes("click")
  );
}

/**
 * Classify a tool call deterministically
 */
export function classifyToolCall(
  toolName: string,
  args: unknown,
  method?: string
): ClassificationResult {
  const normalizedToolName = toolName.toLowerCase();
  const argsStr = JSON.stringify(args).toLowerCase();

  // Extract resource information
  const { domains, recipientDomains, urls } = findDomainsInArgs(args);
  const primaryDomain = domains[0] || recipientDomains[0];
  const primaryRecipientDomain = recipientDomains[0];
  const primaryUrl = urls[0];

  // Determine action class based on patterns
  let actionClass: ActionClass = "read";

  // Check patterns in order of priority (most restrictive first)
  if (TRANSFER_PATTERNS.some((p) => p.test(normalizedToolName) || p.test(argsStr))) {
    actionClass = "transfer_value";
  } else if (EXECUTE_PATTERNS.some((p) => p.test(normalizedToolName))) {
    actionClass = "execute";
  } else if (
    SUBMIT_PATTERNS.some((p) => p.test(normalizedToolName)) ||
    (method && HTTP_MUTATING_METHODS.includes(method.toUpperCase()) &&
      (argsStr.includes("submit") || argsStr.includes("confirm")))
  ) {
    actionClass = "submit";
  } else if (SEND_PATTERNS.some((p) => p.test(normalizedToolName))) {
    actionClass = "send";
  } else if (
    WRITE_PATTERNS.some((p) => p.test(normalizedToolName)) ||
    (method && HTTP_MUTATING_METHODS.includes(method.toUpperCase()))
  ) {
    actionClass = "write";
  }

  // Build risk flags
  const riskFlags = {
    external_domain: isExternalDomain(primaryDomain),
    new_recipient: recipientDomains.length > 0, // Could be enhanced with allowlist check
    attachment: hasAttachment(args),
    form_submit: hasFormSubmit(args),
    shell_exec: EXECUTE_PATTERNS.some((p) => p.test(normalizedToolName)),
    destructive: DESTRUCTIVE_PATTERNS.some(
      (p) => p.test(normalizedToolName) || p.test(argsStr)
    ),
  };

  // Determine risk level based on action class and flags
  let riskLevel: RiskLevel = "low";

  if (actionClass === "transfer_value") {
    riskLevel = "critical";
  } else if (actionClass === "execute") {
    riskLevel = "high";
  } else if (actionClass === "submit") {
    riskLevel = riskFlags.destructive ? "high" : "med";
  } else if (actionClass === "send") {
    riskLevel = riskFlags.external_domain ? "med" : "low";
  } else if (actionClass === "write") {
    riskLevel = riskFlags.destructive ? "med" : "low";
  }

  // Elevate risk if multiple flags are set
  const flagCount = Object.values(riskFlags).filter(Boolean).length;
  if (flagCount >= 3 && riskLevel === "low") {
    riskLevel = "med";
  }

  return {
    actionClass,
    riskLevel,
    riskFlags,
    resource: {
      domain: primaryDomain,
      recipientDomain: primaryRecipientDomain,
      urlHost: primaryUrl?.host,
      urlPath: primaryUrl?.path,
    },
  };
}

/**
 * Get default decision for an action class
 */
export function getDefaultDecision(
  actionClass: ActionClass
): "allowed" | "denied" | "approval_required" {
  switch (actionClass) {
    case "execute":
      return "approval_required";
    case "submit":
      return "approval_required";
    case "transfer_value":
      return "denied";
    case "send":
      return "allowed"; // Will be upgraded to approval_required if external
    case "read":
    case "write":
    default:
      return "allowed";
  }
}
