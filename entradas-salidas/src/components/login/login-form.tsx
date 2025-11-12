// src/components/auth/LoginForm.tsx
import * as React from "react";
import { useRouter } from "next/router";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

import { AuthService, mapFirebaseError } from "@/services/authService";
import { getUserData } from "@/services/usuariosService";

export function LoginForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const router = useRouter();

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);

  const loginEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    setLoading(true);

    try {
      const user = await AuthService.loginWithEmail(email.trim(), password);

      // 🔥 Obtener datos del usuario en Firestore (incluye rol)
      const data = await getUserData(user.uid);

      if (!data?.rol) throw new Error("Tu usuario no tiene rol asignado.");

      if (data.rol === "empleado") {
        router.replace("/empleado");
      } else {
        router.replace("/dashboard");
      }
    } catch (e) {
      setMsg(mapFirebaseError(e));
    } finally {
      setLoading(false);
    }
  };

  const forgot = async () => {
    if (!email) return setMsg("Ingresa tu correo para enviarte el enlace.");
    try {
      await AuthService.resetPassword(email.trim());
      setMsg("Te enviamos el enlace de recuperación.");
    } catch (e) {
      setMsg(mapFirebaseError(e));
    }
  };

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Bienvenido</CardTitle>
          <CardDescription>Inicia sesión para continuar</CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={loginEmail} className="space-y-2">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="email">Correo</FieldLabel>
                <Input
                  id="email"
                  type="email"
                  placeholder="tucorreo@email.com"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </Field>

              <Field>
                <div className="flex items-center">
                  <FieldLabel htmlFor="password">Contraseña</FieldLabel>
                  <button
                    type="button"
                    onClick={forgot}
                    className="ml-auto text-sm underline-offset-4 hover:underline"
                  >
                    ¿Olvidaste tu contraseña?
                  </button>
                </div>
                <Input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </Field>

              {msg && (
                <p className="text-sm text-red-600 text-center pt-2">{msg}</p>
              )}

              <Button type="submit" disabled={loading} className="w-full mt-2">
                {loading ? "Iniciando..." : "Iniciar sesión"}
              </Button>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
