"use client";

import dynamic from "next/dynamic";

// El POS vive en el navegador: lee y guarda en localStorage (pedido, cola de
// ventas, catálogo) para seguir funcionando si se cae el internet.
export const PosCliente = dynamic(() => import("./pos-app").then((m) => m.PosApp), {
  ssr: false,
  loading: () => (
    <div className="grid h-dvh place-items-center bg-cafe">
      <p className="font-titulo text-3xl font-extrabold text-crema">
        Calentando los <span className="text-mostaza">panes</span>…
      </p>
    </div>
  ),
});
