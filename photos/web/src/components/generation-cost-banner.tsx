import { Card } from "@/components/ui/card";

type GenerationCostBannerProps = {
  message: string;
};

export function GenerationCostBanner({ message }: GenerationCostBannerProps) {
  return (
    <Card className="border-emerald-200 bg-emerald-50 text-sm text-emerald-900">
      {message}
    </Card>
  );
}
