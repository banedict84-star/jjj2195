"use client";

import { useState } from "react";
import PosterStudio from "@/components/pr/PosterStudio";
import TextPrStudio from "@/components/pr/TextPrStudio";
import { PageHeader } from "@/components/ui/primitives";

type Tab = "poster" | "text";

export default function PrPage() {
  const [tab, setTab] = useState<Tab>("poster");

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <PageHeader
        title="홍보실"
        desc="웹자보·보도자료·SNS·문자 등 홍보물을 생성하고 관리합니다."
      />

      <div className="mb-6 inline-flex rounded-lg border border-slate-200 bg-white p-1">
        <TabBtn active={tab === "poster"} onClick={() => setTab("poster")}>
          🖼 웹자보
        </TabBtn>
        <TabBtn active={tab === "text"} onClick={() => setTab("text")}>
          📝 보도자료·SNS·문자
        </TabBtn>
      </div>

      {tab === "poster" ? <PosterStudio /> : <TextPrStudio />}
    </main>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${
        active ? "bg-brand text-white" : "text-slate-600 hover:bg-slate-50"
      }`}
    >
      {children}
    </button>
  );
}
