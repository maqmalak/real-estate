import { ExternalLink } from "lucide-react";
import { Button } from "@/re/components/ui/button";
import { Card, CardContent } from "@/re/components/ui/card";
import { deskUrl } from "@/re/lib/utils";

/** A page whose React version is not built yet: says which phase, and opens the working desk screen if there is one. */
export function DeskLinkPage({ title, text, desk, phase }: { title: string; text: string; desk?: string; phase?: string }) {
  return (
    <div className="p-4 sm:p-6">
      <h1 className="mb-4 text-2xl font-bold">{title}</h1>
      <Card className="max-w-xl">
        <CardContent className="space-y-3 pt-4">
          <p>{text}</p>
          {phase && <p className="text-sm text-muted-foreground">Planned in phase {phase} — see apps/realestate/docs/PLAN.md.</p>}
          {desk && (
            <Button asChild>
              <a href={deskUrl(desk)} target="_blank" rel="noreferrer">
                Open in desk <ExternalLink />
              </a>
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
