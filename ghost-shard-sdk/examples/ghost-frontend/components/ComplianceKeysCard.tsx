"use client";

import { useState } from "react";
import { Copy, Check, Eye, EyeOff } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface ComplianceKeysCardProps {
  viewingKey: string | null;
  spendingKey: string | null;
}

export function ComplianceKeysCard({
  viewingKey,
  spendingKey,
}: ComplianceKeysCardProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [showSpending, setShowSpending] = useState(false);

  const handleCopyKey = (key: string, keyType: string) => {
    navigator.clipboard.writeText(key);
    setCopiedKey(keyType);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const maskKey = (key: string) => {
    if (!key || key.length < 8) return "••••••••";
    return key.substring(0, 6) + "••••" + key.substring(key.length - 4);
  };

  return (
    <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-background mb-6">
      <CardHeader>
        <CardTitle>Compliance Keys</CardTitle>
        <CardDescription>For regulatory verification with auditors</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Viewing Key */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">Viewing Key</label>
            <span className="text-xs text-muted-foreground">Read-only, safe to share</span>
          </div>
          <div className="flex items-center gap-2 rounded-lg border bg-muted/30 p-3 font-mono text-sm">
            <code className="flex-1 break-all text-foreground">{viewingKey || "N/A"}</code>
            {viewingKey && (
              <Button
                variant={copiedKey === "viewing" ? "default" : "outline"}
                size="sm"
                onClick={() => handleCopyKey(viewingKey, "viewing")}
                className="flex-shrink-0"
              >
                {copiedKey === "viewing" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            )}
          </div>
        </div>

        {/* Spending Key */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">Spending Key</label>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Private - handle with care</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowSpending(!showSpending)}
              >
                {showSpending ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-lg border bg-muted/30 p-3 font-mono text-sm">
            <code className="flex-1 break-all text-foreground">
              {showSpending ? spendingKey || "N/A" : maskKey(spendingKey || "")}
            </code>
            {spendingKey && (
              <Button
                variant={copiedKey === "spending" ? "default" : "outline"}
                size="sm"
                onClick={() => handleCopyKey(spendingKey, "spending")}
                className="flex-shrink-0"
              >
                {copiedKey === "spending" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            )}
          </div>
        </div>

        <Alert className="border-amber-600/40 bg-amber-900/20">
          <AlertDescription>
            <strong className="text-destructive">Security Warning:</strong> Never share your spending key except with authorized auditors.
            The viewing key alone allows auditors to see your history without accessing funds.
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}
