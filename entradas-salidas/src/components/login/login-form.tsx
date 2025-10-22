// src/components/auth/LoginForm.tsx
import * as React from "react";
import { useRouter } from "next/router";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldSeparator } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

import { AuthService, mapFirebaseError } from "@/services/authService";


export function LoginForm({ className, ...props }: React.ComponentProps<"div">) {
  const router = useRouter();
  const from = (router.query.from as string) || "/dashboard";

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [loading, setLoading] = React.useState<"google" | "email" | null>(null);
  const [msg, setMsg] = React.useState<string | null>(null);

  const goNext = React.useCallback(
    () => router.replace(from || "/dashboard"),
    [router, from]
  );

  const loginGoogle = async () => {
    setMsg(null); setLoading("google");
    try { await AuthService.loginWithGoogle(); goNext(); }
    catch (e) { setMsg(mapFirebaseError(e)); }
    finally { setLoading(null); }
  };

  const loginEmail = async (e: React.FormEvent) => {
    e.preventDefault(); setMsg(null); setLoading("email");
    try { await AuthService.loginWithEmail(email.trim(), password); goNext(); }
    catch (e) { setMsg(mapFirebaseError(e)); }
    finally { setLoading(null); }
  };

  const forgot = async () => {
    if (!email) return setMsg("Ingresa tu correo para enviarte el enlace.");
    try { await AuthService.resetPassword(email.trim()); setMsg("Te enviamos el enlace de recuperación."); }
    catch (e) { setMsg(mapFirebaseError(e)); }
  };

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Bienvenido</CardTitle>
          <CardDescription>Login with your Google account</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={loginEmail} className="space-y-2">
            <FieldGroup>
              <Field>
                <Button type="button" variant="outline" onClick={loginGoogle} disabled={loading !== null} className="w-full gap-2">
                  {/* tu ícono */}
                  {loading === "google" ? "Ingresando..." : "Login with Google"}
                </Button>
              </Field>

              <FieldSeparator className="*:data-[slot=field-separator-content]:bg-card">
                Or continue with
              </FieldSeparator>

              <Field>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input id="email" type="email" placeholder="m@example.com" required
                  value={email} onChange={(e) => setEmail(e.target.value)} />
              </Field>

              <Field>
                <div className="flex items-center">
                  <FieldLabel htmlFor="password">Password</FieldLabel>
                  <button type="button" onClick={forgot} className="ml-auto text-sm underline-offset-4 hover:underline">
                    Forgot your password?
                  </button>
                </div>
                <Input id="password" type="password" required
                  value={password} onChange={(e) => setPassword(e.target.value)} />
              </Field>
              {msg && <p className="text-sm text-red-600 text-center pt-2">{msg}</p>}
            </FieldGroup>
          </form>
        </CardContent>
      </Card>

    </div>
  );
}
