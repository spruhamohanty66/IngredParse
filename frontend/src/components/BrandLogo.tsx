import Image from "next/image";
import { BRAND } from "@/lib/brand";

interface Props {
  size?: "sm" | "md" | "lg";
  showTagline?: boolean;
}

const SIZE_CONFIG = {
  sm: { w: 19, h: 28, text: "text-base",  tagline: "text-[9px]"  },
  md: { w: 24, h: 36, text: "text-lg",    tagline: "text-[10px]" },
  lg: { w: 32, h: 48, text: "text-2xl",   tagline: "text-xs"     },
};

export default function BrandLogo({ size = "md", showTagline = false }: Props) {
  const cfg = SIZE_CONFIG[size];

  return (
    <div className="flex items-center gap-2.5">
      <Image
        src="/logo.png"
        alt={BRAND.name}
        width={cfg.w}
        height={cfg.h}
        className="rounded-xl flex-shrink-0"
        priority
      />
      <div className="flex flex-col">
        <span className={`${cfg.text} font-bold tracking-tight text-slate-900 leading-none`}>
          {BRAND.name}
        </span>
        {showTagline && (
          <span className={`${cfg.tagline} text-slate-400 mt-0.5 leading-none`}>
            {BRAND.tagline}
          </span>
        )}
      </div>
    </div>
  );
}
