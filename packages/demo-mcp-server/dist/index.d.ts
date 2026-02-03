#!/usr/bin/env node
/**
 * Latch Demo MCP Server
 *
 * A deterministic MCP server with tools that cover all action classes.
 * Logs all invocations to stderr for test assertions.
 *
 * Tools:
 * - notes.read (READ) - Read a note
 * - file.write (WRITE) - Write to a file
 * - email.send (SEND) - Send an email
 * - shell.exec (EXECUTE) - Execute a command
 * - form.submit (SUBMIT) - Submit a form
 * - payment.send (TRANSFER_VALUE) - Send a payment
 *
 * Each tool logs its invocation and returns a predictable response.
 */
export {};
