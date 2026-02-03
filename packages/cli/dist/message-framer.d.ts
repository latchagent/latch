/**
 * MCP Message Framer
 *
 * Handles proper JSON-RPC message framing for MCP stdio transport.
 * MCP uses newline-delimited JSON, but messages can be split across
 * multiple chunks or multiple messages can arrive in one chunk.
 *
 * This class buffers incoming data and extracts complete JSON messages.
 */
export declare class MessageFramer {
    private buffer;
    /**
     * Push a chunk of data and return any complete messages
     */
    push(chunk: Buffer | string): unknown[];
    /**
     * Check if there's buffered data (incomplete message)
     */
    hasBufferedData(): boolean;
    /**
     * Get the current buffer (for debugging)
     */
    getBuffer(): string;
    /**
     * Clear the buffer
     */
    clear(): void;
}
