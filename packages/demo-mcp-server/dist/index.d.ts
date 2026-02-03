#!/usr/bin/env node
/**
 * Latch Demo MCP Server
 *
 * A deterministic MCP server with tools that cover all action classes.
 * Logs all invocations to stderr for test assertions.
 *
 * Tools:
 * - notes_read (READ) - Read a note
 * - file_write (WRITE) - Write to a file
 * - email_send (SEND) - Send an email
 * - shell_exec (EXECUTE) - Execute a command
 * - form_submit (SUBMIT) - Submit a form
 * - payment_send (TRANSFER_VALUE) - Send a payment
 *
 * Each tool logs its invocation and returns a predictable response.
 */
export {};
