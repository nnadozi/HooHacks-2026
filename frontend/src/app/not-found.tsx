"use client";

import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

export default function NotFound() {
  return (
    <main className="flex min-h-[calc(100vh-3.5rem)] flex-col items-center justify-center bg-background px-4 py-16">
      <Card className="w-full max-w-md border-border shadow-sm">
        <CardHeader>
          <CardTitle>404</CardTitle>
          <CardDescription>This page doesn&apos;t exist.</CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/" className={cn(buttonVariants())}>
            Back home
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}
