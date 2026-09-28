/** Se muestra al instante al cambiar de módulo, mientras llega la página. */
export default function Cargando() {
  return (
    <div className="animate-pulse space-y-6" aria-label="Cargando">
      <div className="h-9 w-48 rounded-xl bg-cafe-100" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-24 rounded-2xl bg-cafe-100/70" />
        ))}
      </div>
      <div className="h-64 rounded-3xl bg-cafe-100/50" />
    </div>
  );
}
