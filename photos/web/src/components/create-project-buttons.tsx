"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { api, ProjectType } from "@/lib/api";

type CreateProjectButtonsProps = {
  token: string;
};

type ActiveProjectType = Extract<ProjectType, "advanced" | "photo_series">;

export function CreateProjectButtons({ token }: CreateProjectButtonsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState<ActiveProjectType | null>(null);

  async function handleCreate(type: ActiveProjectType) {
    setLoading(type);
    try {
      const name =
        type === "photo_series" ? "Nowa seria zdjęć" : "Projekt zdjęcie produktowe pojedyncze";
      const project = await api.createProject(token, name, type);
      router.push(`/dashboard/projects/${project.id}`);
      router.refresh();
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button onClick={() => handleCreate("advanced")} loading={loading === "advanced"}>
        Zdjęcia pojedyncze
      </Button>
      <Button
        variant="secondary"
        onClick={() => handleCreate("photo_series")}
        loading={loading === "photo_series"}
      >
        Zdjęcia seryjne
      </Button>
    </div>
  );
}
