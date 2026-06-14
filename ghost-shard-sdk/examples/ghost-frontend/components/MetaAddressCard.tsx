"use client";

import { Copy, Check, Eye, EyeOff } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface MetaAddressCardProps {
  metaAddress: string;
  onCopy: () => void;
  copied: boolean;
  onToggleComplianceKeys: () => void;
  showComplianceKeys: boolean;
  viewingKey: string | null;
  spendingKey: string | null;
}

export function MetaAddressCard({
  metaAddress,
  onCopy,
  copied,
  onToggleComplianceKeys,
  showComplianceKeys,
}: MetaAddressCardProps) {
  return (
    <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-background mb-6">
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div className="flex-1 pr-4">
          <CardTitle>Your Meta Address</CardTitle>
          <CardDescription>
            Share this address to receive private payments. The SDK automatically manages stealth addresses.
          </CardDescription>
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={onToggleComplianceKeys}
          title={showComplianceKeys ? "Hide compliance keys" : "Show compliance keys"}
        >
          {showComplianceKeys ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2 rounded-lg border bg-muted/30 p-3 font-mono text-sm">
          <code className="flex-1 break-all text-foreground">{metaAddress}</code>
          <Button
            variant={copied ? "default" : "outline"}
            size="sm"
            onClick={onCopy}
            className="flex-shrink-0"
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>

        <Alert className="border-primary/30 bg-primary/5">
          <AlertDescription>
            <strong>How to receive:</strong> Share this meta address with anyone. They can send you private
            payments which will create new stealth addresses for you automatically.
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}
