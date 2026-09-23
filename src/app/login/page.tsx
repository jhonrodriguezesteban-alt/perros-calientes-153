import { FormularioLogin } from "./formulario";

export default async function Login({ searchParams }: PageProps<"/login">) {
  const { error } = await searchParams;
  const errorInicial = error === "inactivo" ? "Tu usuario está desactivado. Habla con un socio." : null;

  return (
    <main className="grid min-h-dvh place-items-center bg-cafe px-4 py-10">
      <div className="w-full max-w-md rounded-3xl bg-crema p-8 shadow-2xl">
        <p className="font-titulo text-4xl font-extrabold leading-none">
          Bendito <span className="text-rojo">Perro</span> Caliente
        </p>
        <p className="mb-8 mt-2 border-b-4 border-mostaza pb-3 font-etiqueta font-semibold text-cafe-700">
          Antojo con cariño. Entra para empezar el turno.
        </p>
        <FormularioLogin errorInicial={errorInicial} />
      </div>
    </main>
  );
}
