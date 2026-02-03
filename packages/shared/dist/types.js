"use strict";
/**
 * Shared types for Latch CLI and Cloud
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MCP_ERROR_CODES = void 0;
/**
 * MCP Error Codes
 */
exports.MCP_ERROR_CODES = {
    PARSE_ERROR: -32700,
    INVALID_REQUEST: -32600,
    METHOD_NOT_FOUND: -32601,
    INVALID_PARAMS: -32602,
    INTERNAL_ERROR: -32603,
    // Custom Latch codes
    APPROVAL_REQUIRED: -32001,
    ACCESS_DENIED: -32002,
    TOKEN_INVALID: -32003,
};
//# sourceMappingURL=types.js.map