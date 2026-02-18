"use client"

import { WriteView } from "@/components/WriteView"
import { Suspense } from "react"

function WriteViewFallback() {
  return (
    <div className="flex h-screen items-center justify-center text-muted-foreground">
      Loading...
    </div>
  )
}

export default function Page() {
  return (
    <Suspense fallback={<WriteViewFallback />}>
      <WriteView />
    </Suspense>
  )
}
