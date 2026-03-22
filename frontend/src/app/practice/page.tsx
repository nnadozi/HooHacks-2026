"use client";

import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getUserHistory } from "@/lib/api";

export default function PracticePage() {
  const router = useRouter();
  const [tab, setTab] = useState<"choreography" | "routine">("choreography");

  const [choreoInput, setChoreoInput] = useState("");
  const [routineInput, setRoutineInput] = useState("");

  const historyQuery = useQuery({
    queryKey: ["user-history"],
    queryFn: getUserHistory,
    staleTime: 15_000,
  });

  return (
    <main className="min-h-[calc(100vh-3.5rem)] bg-background px-3 py-8 sm:px-6 sm:py-10">
      <div className="mx-auto flex w-full max-w-none flex-col gap-8">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
            Practice
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Load a choreography or a saved routine, then slow down or speed up playback.
          </p>
        </div>

        <Tabs
          value={tab}
          onValueChange={(v) => {
            if (v === "choreography" || v === "routine") {
              setTab(v);
            }
          }}
          className="flex w-full flex-col gap-6"
        >
          <TabsList className="h-10 w-full max-w-sm rounded-lg bg-muted/80 p-1">
            <TabsTrigger value="choreography" className="flex-1 rounded-md text-sm">
              Choreography
            </TabsTrigger>
            <TabsTrigger value="routine" className="flex-1 rounded-md text-sm">
              Routine
            </TabsTrigger>
          </TabsList>

          <TabsContent
            value="choreography"
            className="mt-0 grid grid-cols-1 gap-6 lg:grid-cols-[22rem_1fr]"
          >
            <div className="flex flex-col gap-6">
              <Card className="border-border shadow-sm">
                <CardHeader className="gap-1">
                  <CardTitle className="text-base font-medium">Load by ID</CardTitle>
                  <CardDescription>Paste a choreography id.</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="choreo-id">Choreography id</Label>
                    <Input
                      id="choreo-id"
                      value={choreoInput}
                      onChange={(e) => setChoreoInput(e.target.value)}
                      placeholder="e.g. 65f1…"
                      className="font-mono"
                    />
                  </div>
                  <Button
                    type="button"
                    onClick={() => {
                      const id = choreoInput.trim();
                      if (id) router.push(`/practice/choreography/${id}`);
                    }}
                    disabled={!choreoInput.trim()}
                  >
                    Load
                  </Button>
                </CardContent>
              </Card>

              <Card className="border-border shadow-sm">
                <CardHeader className="gap-1">
                  <CardTitle className="text-base font-medium">Recent sessions</CardTitle>
                  <CardDescription>Pick a choreography from your feedback history.</CardDescription>
                </CardHeader>
                <CardContent>
                  {historyQuery.isLoading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="size-4 animate-spin" />
                      Loading…
                    </div>
                  ) : historyQuery.isError ? (
                    <p className="text-sm text-destructive">
                      {historyQuery.error instanceof Error
                        ? historyQuery.error.message
                        : "Could not load history."}
                    </p>
                  ) : (historyQuery.data?.history?.length ?? 0) === 0 ? (
                    <p className="text-sm text-muted-foreground">No sessions yet.</p>
                  ) : (
                    <ScrollArea className="h-56 rounded-lg border border-border bg-muted/20">
                      <div className="flex flex-col gap-2 p-3">
                        {(historyQuery.data?.history ?? [])
                          .slice(0, 12)
                          .map((row) => (
                            <Button
                              key={row.id}
                              type="button"
                              variant="secondary"
                              className="h-auto justify-between gap-3 px-3 py-2"
                              onClick={() => {
                                setChoreoInput(row.choreography_id);
                                router.push(`/practice/choreography/${row.choreography_id}`);
                              }}
                            >
                              <span className="truncate font-mono text-xs">
                                {row.choreography_id}
                              </span>
                              <span className="shrink-0 text-xs text-muted-foreground">
                                {row.score != null ? `${row.score} pts` : "—"}
                              </span>
                            </Button>
                          ))}
                      </div>
                    </ScrollArea>
                  )}
                </CardContent>
              </Card>
            </div>

            <Card className="border-border shadow-sm">
              <CardHeader className="gap-1">
                <CardTitle className="text-base font-medium">How practice works</CardTitle>
                <CardDescription>
                  We load the choreography preview frames and (when available) the source video.
                  Use the speed control to drill sections.
                </CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Paste an id or pick a recent session to open{" "}
                <span className="font-mono">/practice/choreography/&lt;id&gt;</span>.
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent
            value="routine"
            className="mt-0 grid grid-cols-1 gap-6 lg:grid-cols-[22rem_1fr]"
          >
            <div className="flex flex-col gap-6">
              <Card className="border-border shadow-sm">
                <CardHeader className="gap-1">
                  <CardTitle className="text-base font-medium">Load by ID</CardTitle>
                  <CardDescription>Paste a routine id (from the editor save flow).</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="routine-id">Routine id</Label>
                    <Input
                      id="routine-id"
                      value={routineInput}
                      onChange={(e) => setRoutineInput(e.target.value)}
                      placeholder="e.g. 65f1…"
                      className="font-mono"
                    />
                  </div>
                  <Button
                    type="button"
                    onClick={() => {
                      const id = routineInput.trim();
                      if (id) router.push(`/practice/routine/${id}`);
                    }}
                    disabled={!routineInput.trim()}
                  >
                    Load
                  </Button>
                </CardContent>
              </Card>

              <Card className="border-border shadow-sm">
                <CardHeader className="gap-1">
                  <CardTitle className="text-base font-medium">Tip</CardTitle>
                  <CardDescription>
                    Routines don&apos;t include a reference video yet, so playback is skeleton-only.
                  </CardDescription>
                </CardHeader>
              </Card>
            </div>

            <Card className="border-border shadow-sm">
              <CardHeader className="gap-1">
                <CardTitle className="text-base font-medium">Routine practice</CardTitle>
                <CardDescription>
                  Routines currently play as skeleton-only previews (no reference video yet).
                </CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Paste an id to open{" "}
                <span className="font-mono">/practice/routine/&lt;id&gt;</span>.
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}
