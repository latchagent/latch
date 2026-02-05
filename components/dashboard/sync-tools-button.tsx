"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";

export function SyncToolsButton({
  upstreamId,
  disabled,
}: {
  upstreamId: string;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const onClick = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/upstreams/${upstreamId}/sync-tools`, { method: "POST" });
      const data = (await res.json()) as { toolsCount?: number; error?: string };
      if (!res.ok) throw new Error(data.error || "Failed to sync tools");

      toast({
        title: "Tools synced",
        description: `Discovered ${data.toolsCount ?? 0} tools.`,
      });
      router.refresh();
    } catch (e) {
      toast({
        title: "Tool sync failed",
        description: e instanceof Error ? e.message : "Failed to sync tools",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button size="sm" variant="outline" onClick={onClick} disabled={disabled || isLoading}>
      {isLoading ? "Syncing..." : "Sync tools"}
    </Button>
  );
}

