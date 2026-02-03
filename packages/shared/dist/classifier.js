"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.classifyToolCall = classifyToolCall;
exports.getDefaultDecision = getDefaultDecision;
/**
 * Deterministic Action Classifier
 *
 * Classifies MCP tool calls into action classes based on tool name and arguments.
 * This classification is used for policy evaluation.
 *
 * IMPORTANT: Classification must be deterministic. No AI/ML in this path.
 */
// Patterns for classification (order matters - most restrictive first)
const EXECUTE_PATTERNS = [
    /exec/i,
    /command/i,
    /script/i,
    /shell/i,
    /bash/i,
    /run_?code/i,
    /terminal/i,
    /spawn/i,
    /system/i,
    /\beval\b/i,
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
    /purchase/i,
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
    /commit/i,
];
const SEND_PATTERNS = [
    /send/i,
    /post(?!gres)/i, // post but not postgres
    /notify/i,
    /email/i,
    /message/i,
    /slack/i,
    /tweet/i,
    /\bdm\b/i,
    /sms/i,
    /broadcast/i,
];
const WRITE_PATTERNS = [
    /write/i,
    /update/i,
    /delete/i,
    /remove/i,
    /modify/i,
    /edit/i,
    /patch/i,
    /\bput\b/i,
    /insert/i,
    /upsert/i,
    /save/i,
    /create(?!_pr)/i, // create but not create_pr
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
    /\bclear\b/i,
];
/**
 * Extract domain from a URL or email
 */
function extractDomain(value) {
    try {
        if (value.startsWith("http://") || value.startsWith("https://")) {
            const url = new URL(value);
            return url.hostname;
        }
        if (value.includes("@") && !value.includes(" ")) {
            const parts = value.split("@");
            if (parts.length === 2 && parts[1]) {
                return parts[1].toLowerCase();
            }
        }
        return undefined;
    }
    catch {
        return undefined;
    }
}
/**
 * Extract URL components
 */
function extractUrlComponents(value) {
    try {
        if (value.startsWith("http://") || value.startsWith("https://")) {
            const url = new URL(value);
            return { host: url.hostname, path: url.pathname };
        }
        return undefined;
    }
    catch {
        return undefined;
    }
}
/**
 * Check if domain is external (not localhost or common internal domains)
 */
function isExternalDomain(domain) {
    if (!domain)
        return false;
    const internal = [
        "localhost",
        "127.0.0.1",
        "0.0.0.0",
        "internal",
        "local",
        "intranet",
        "10.",
        "192.168.",
        "172.16.",
    ];
    const lowerDomain = domain.toLowerCase();
    return !internal.some((i) => lowerDomain === i || lowerDomain.startsWith(i) || lowerDomain.endsWith(`.${i}`));
}
/**
 * Search for domains/emails in args recursively
 */
function findDomainsInArgs(args) {
    const domains = [];
    const recipientDomains = [];
    const recipients = []; // Full email addresses
    const urls = [];
    // Email regex
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    function search(obj, key) {
        if (typeof obj === "string") {
            const domain = extractDomain(obj);
            const isRecipientKey = key &&
                (key.toLowerCase().includes("to") ||
                    key.toLowerCase().includes("recipient") ||
                    key.toLowerCase().includes("email"));
            // Check if it's an email address
            if (emailRegex.test(obj.trim()) && isRecipientKey) {
                recipients.push(obj.trim().toLowerCase());
            }
            if (domain) {
                if (isRecipientKey) {
                    recipientDomains.push(domain);
                }
                else {
                    domains.push(domain);
                }
            }
            const urlParts = extractUrlComponents(obj);
            if (urlParts) {
                urls.push(urlParts);
            }
        }
        else if (Array.isArray(obj)) {
            obj.forEach((item) => search(item, key));
        }
        else if (obj && typeof obj === "object") {
            Object.entries(obj).forEach(([k, v]) => search(v, k));
        }
    }
    search(args);
    return { domains, recipientDomains, recipients, urls };
}
/**
 * Check if args contain attachment indicators
 */
function hasAttachment(args) {
    const str = JSON.stringify(args).toLowerCase();
    return (str.includes("attachment") ||
        str.includes("file") ||
        str.includes("upload") ||
        str.includes("base64"));
}
/**
 * Check if args contain form submission indicators
 */
function hasFormSubmit(args) {
    const str = JSON.stringify(args).toLowerCase();
    return (str.includes("form") ||
        str.includes("submit") ||
        str.includes("button") ||
        str.includes("click"));
}
/**
 * Classify a tool call deterministically
 *
 * @param toolName - The MCP tool name
 * @param args - The tool call arguments
 * @returns Classification result with action class, risk level, flags, and metadata
 */
function classifyToolCall(toolName, args) {
    const normalizedToolName = toolName.toLowerCase();
    const argsStr = JSON.stringify(args || {}).toLowerCase();
    // Extract resource information
    const { domains, recipientDomains, recipients, urls } = findDomainsInArgs(args);
    const primaryDomain = domains[0] || recipientDomains[0];
    const primaryRecipientDomain = recipientDomains[0];
    const primaryRecipient = recipients[0];
    const primaryUrl = urls[0];
    // Determine action class based on patterns (most restrictive first)
    let actionClass = "read";
    if (TRANSFER_PATTERNS.some((p) => p.test(normalizedToolName) || p.test(argsStr))) {
        actionClass = "transfer_value";
    }
    else if (EXECUTE_PATTERNS.some((p) => p.test(normalizedToolName))) {
        actionClass = "execute";
    }
    else if (SUBMIT_PATTERNS.some((p) => p.test(normalizedToolName))) {
        actionClass = "submit";
    }
    else if (SEND_PATTERNS.some((p) => p.test(normalizedToolName))) {
        actionClass = "send";
    }
    else if (WRITE_PATTERNS.some((p) => p.test(normalizedToolName))) {
        actionClass = "write";
    }
    // Build risk flags
    const riskFlags = {
        external_domain: isExternalDomain(primaryDomain),
        new_recipient: recipientDomains.length > 0,
        attachment: hasAttachment(args),
        form_submit: hasFormSubmit(args),
        shell_exec: EXECUTE_PATTERNS.some((p) => p.test(normalizedToolName)),
        destructive: DESTRUCTIVE_PATTERNS.some((p) => p.test(normalizedToolName) || p.test(argsStr)),
    };
    // Determine risk level
    let riskLevel = "low";
    if (actionClass === "transfer_value") {
        riskLevel = "critical";
    }
    else if (actionClass === "execute") {
        riskLevel = "high";
    }
    else if (actionClass === "submit") {
        riskLevel = riskFlags.destructive ? "high" : "med";
    }
    else if (actionClass === "send") {
        riskLevel = riskFlags.external_domain ? "med" : "low";
    }
    else if (actionClass === "write") {
        riskLevel = riskFlags.destructive ? "med" : "low";
    }
    // Elevate risk if multiple flags
    const flagCount = Object.values(riskFlags).filter(Boolean).length;
    if (flagCount >= 3 && riskLevel === "low") {
        riskLevel = "med";
    }
    // Build resource metadata
    const resource = {
        domain: primaryDomain,
        recipientDomain: primaryRecipientDomain,
        recipient: primaryRecipient,
        to: primaryRecipient, // Alias
        urlHost: primaryUrl?.host,
        urlPath: primaryUrl?.path,
    };
    return {
        actionClass,
        riskLevel,
        riskFlags,
        resource,
    };
}
/**
 * Get default decision for an action class
 */
function getDefaultDecision(actionClass, riskFlags) {
    switch (actionClass) {
        case "execute":
            return "approval_required";
        case "submit":
            return "approval_required";
        case "transfer_value":
            return "denied";
        case "send":
            // External send requires approval by default
            if (riskFlags?.external_domain) {
                return "approval_required";
            }
            return "allowed";
        case "read":
        case "write":
        default:
            return "allowed";
    }
}
//# sourceMappingURL=classifier.js.map