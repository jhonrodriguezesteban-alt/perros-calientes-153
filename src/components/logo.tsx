import Image from "next/image";

/**
 * Logo completo de la marca. Sobre fondos oscuros va dentro de una placa
 * crema para que se lea el café de las letras.
 */
export function Logo({ alto = 40, placa = false, className = "" }: { alto?: number; placa?: boolean; className?: string }) {
  const img = (
    <Image
      src="/marca/logo.png"
      alt="Bendito Perro Caliente"
      width={Math.round((alto * 1568) / 712)}
      height={alto}
      priority
      className="h-auto max-w-full"
    />
  );
  if (!placa) return <span className={className}>{img}</span>;
  return <span className={`inline-flex shrink-0 rounded-2xl bg-crema px-2.5 py-1 shadow-sm ${className}`}>{img}</span>;
}
