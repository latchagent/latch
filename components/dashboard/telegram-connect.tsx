"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CheckCircle2, ExternalLink, RefreshCw, Unlink } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface TelegramConnectProps {
  isLinked: boolean;
  telegramUsername?: string | null;
}

export function TelegramConnect({
  isLinked,
  telegramUsername,
}: TelegramConnectProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [linkUrl, setLinkUrl] = useState<string | null>(null);

  const generateLink = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/telegram/link", {
        method: "POST",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to generate link");
      }

      setLinkUrl(data.url);
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to generate link",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const unlink = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/telegram/unlink", {
        method: "POST",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to unlink");
      }

      toast({
        title: "Telegram unlinked",
        description: "You will no longer receive Telegram notifications.",
      });
      router.refresh();
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to unlink",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (isLinked) {
    return (
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-emerald-500" />
          <div>
            <p className="text-sm font-medium">Connected</p>
            {telegramUsername && (
              <p className="text-sm text-muted-foreground">@{telegramUsername}</p>
            )}
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={unlink} disabled={isLoading}>
          <Unlink className="mr-2 h-4 w-4" />
          Disconnect
        </Button>
      </div>
    );
  }

  if (linkUrl) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Click the button below to open Telegram and complete the connection.
        </p>
        <div className="flex items-center gap-2">
          <Button asChild>
            <a href={linkUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-2 h-4 w-4" />
              Open Telegram
            </a>
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => router.refresh()}
            title="Refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          After clicking Start in Telegram, refresh this page.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Connect your Telegram account to receive instant approval notifications with
        interactive approve/deny buttons.
      </p>
      <Button onClick={generateLink} disabled={isLoading}>
        {isLoading ? "Generating..." : "Connect Telegram"}
      </Button>
    </div>
  );
}
