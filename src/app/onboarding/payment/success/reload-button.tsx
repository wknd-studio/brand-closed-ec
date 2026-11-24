"use client";

import { Button } from "@/components/ui/button";

export default function ReloadButton() {
  return (
    <Button
      variant="secondary"
      size="sm"
      className="h-11 px-[22px] text-sm"
      onClick={() => window.location.reload()}
    >
      再読み込みする
    </Button>
  );
}
