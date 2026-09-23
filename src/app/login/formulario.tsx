"use client";

import { Loader2 } from "lucide-react";
import { useActionState } from "react";
import { iniciarSesion } from "./acciones";

export function FormularioLogin({ errorInicial }: { errorInicial: string | null }) {
  const [estado, accion, enviando] = useActionState(iniciarSesion, { error: errorInicial, email: "" });

  return (
    <form action={accion} className="space-y-4">
      <label className="block">
        <span className="mb-1 block font-etiqueta text-sm font-semibold uppercase tracking-wide text-cafe-700">Correo</span>
        <input
          name="email"
          type="email"
          autoComplete="username"
          defaultValue={estado.email}
          key={estado.email}
          required
          className="h-14 w-full rounded-2xl bg-crema px-4 text-lg ring-2 ring-cafe-100 outline-none focus:ring-cafe"
        />
      </label>
      <label className="block">
        <span className="mb-1 block font-etiqueta text-sm font-semibold uppercase tracking-wide text-cafe-700">Contraseña</span>
        <input
          name="clave"
          type="password"
          autoComplete="current-password"
          required
          className="h-14 w-full rounded-2xl bg-crema px-4 text-lg ring-2 ring-cafe-100 outline-none focus:ring-cafe"
        />
      </label>
      {estado.error && <p className="rounded-xl bg-rojo/10 px-4 py-3 font-semibold text-rojo-700">{estado.error}</p>}
      <button
        disabled={enviando}
        className="flex h-16 w-full items-center justify-center gap-3 rounded-2xl bg-rojo font-etiqueta text-xl font-extrabold text-white shadow-md active:bg-rojo-700 disabled:bg-cafe-300"
      >
        {enviando && <Loader2 className="size-6 animate-spin" />}
        Entrar
      </button>
    </form>
  );
}
