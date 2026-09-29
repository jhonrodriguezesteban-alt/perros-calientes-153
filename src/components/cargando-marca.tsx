import Image from "next/image";

/** La salchicha de Bendito dando saltos mientras carga algo. */
export function CargandoMarca({ texto = "Cargando…", className = "" }: { texto?: string; className?: string }) {
  return (
    <div className={`grid place-items-center gap-3 py-16 ${className}`} role="status" aria-label={texto}>
      <Image src="/marca/mascota.png" alt="" width={44} height={94} priority className="animate-salchicha h-auto w-11" />
      <span className="h-1.5 w-10 animate-sombra rounded-full bg-cafe/20" aria-hidden />
      <p className="font-etiqueta text-sm font-semibold text-cafe-700">{texto}</p>
    </div>
  );
}
