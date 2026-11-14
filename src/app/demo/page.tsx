"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Cargando } from "@/components/ui";
import { entrarDemo } from "@/lib/store";

export default function DemoPage() {
  const router = useRouter();
  useEffect(() => {
    entrarDemo("admin");
    router.replace("/panel");
  }, [router]);
  return <Cargando />;
}
