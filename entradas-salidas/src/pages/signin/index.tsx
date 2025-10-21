import { LoginForm } from "../../components/login/login-form";

export default function SignInPage() {
  return (
    <main className="min-h-screen grid place-items-center p-6">
      <div className="w-full max-w-md">
        <LoginForm />
      </div>
    </main>
  );
}