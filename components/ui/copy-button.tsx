"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { Button } from "./button";

interface CopyButtonProps {
  value: string;
  className?: string;
}

export function CopyButton({ value, className }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      className={`h-6 w-6 p-0 ${className}`}
      onClick={handleCopy}
    >
      {copied ? (
        <Check className="h-3 w-3 text-emerald-500" />
      ) : (
        <Copy className="h-3 w-3 text-muted-foreground" />
      )}
    </Button>
  );
}

interface CopyableIdProps {
  id: string;
  truncate?: boolean;
}

export function CopyableId({ id, truncate = true }: CopyableIdProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const displayId = truncate ? `${id.slice(0, 8)}...` : id;

  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-1.5 font-mono text-xs hover:bg-muted px-1.5 py-0.5 rounded transition-colors group"
      title={`Click to copy: ${id}`}
    >
      <span>{displayId}</span>
      {copied ? (
        <Check className="h-3 w-3 text-emerald-500" />
      ) : (
        <Copy className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
      )}
    </button>
  );
}
