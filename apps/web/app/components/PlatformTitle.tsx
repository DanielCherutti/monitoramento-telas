import Image from "next/image";

type Props = {
  className?: string;
  logoSize?: number;
  /** Caminho da imagem (ex: /images/icon.png). Se não informado, usa a logo padrão. */
  logoSrc?: string;
  /** Se true, usa texto escuro (header claro). Se false, texto branco (header escuro). */
  lightBg?: boolean;
};

export function PlatformTitle({ className = "", logoSize = 28, logoSrc = "/images/logo-pazini.png", lightBg = true }: Props) {
  const textClass = lightBg ? "text-slate-900" : "text-white";
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Image
        src={logoSrc}
        alt=""
        width={logoSize}
        height={logoSize}
        className="rounded object-contain shrink-0"
      />
      <span className={`font-semibold ${textClass}`}>Pazini Monitoramento</span>
    </div>
  );
}
