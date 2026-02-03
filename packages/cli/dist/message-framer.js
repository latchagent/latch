/**
 * MCP Message Framer
 *
 * Handles proper JSON-RPC message framing for MCP stdio transport.
 * MCP uses newline-delimited JSON, but messages can be split across
 * multiple chunks or multiple messages can arrive in one chunk.
 *
 * This class buffers incoming data and extracts complete JSON messages.
 */
export class MessageFramer {
    buffer = "";
    /**
     * Push a chunk of data and return any complete messages
     */
    push(chunk) {
        this.buffer += typeof chunk === "string" ? chunk : chunk.toString("utf8");
        const messages = [];
        let newlineIndex;
        // Extract complete messages (newline-delimited)
        while ((newlineIndex = this.buffer.indexOf("\n")) !== -1) {
            const line = this.buffer.slice(0, newlineIndex).trim();
            this.buffer = this.buffer.slice(newlineIndex + 1);
            if (line.length === 0)
                continue;
            try {
                const message = JSON.parse(line);
                messages.push(message);
            }
            catch (error) {
                // Log parse error but continue processing
                console.error("Failed to parse MCP message:", error);
                console.error("Line:", line.slice(0, 200));
            }
        }
        return messages;
    }
    /**
     * Check if there's buffered data (incomplete message)
     */
    hasBufferedData() {
        return this.buffer.trim().length > 0;
    }
    /**
     * Get the current buffer (for debugging)
     */
    getBuffer() {
        return this.buffer;
    }
    /**
     * Clear the buffer
     */
    clear() {
        this.buffer = "";
    }
}
//# sourceMappingURL=message-framer.js.map