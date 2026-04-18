import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

function resolveApiUrl(path: string): string {
  const baseUrl = import.meta.env.VITE_API_BASE_URL;
  if (baseUrl) {
    return `${baseUrl.replace(/\/$/, "")}${path}`;
  }

  if (import.meta.env.DEV) {
    return `http://localhost:3001${path}`;
  }

  return path;
}

export default function AdminResetPassword() {
  const token = useMemo(() => new URLSearchParams(window.location.search).get("token") || "", []);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const handleSubmit = async () => {
    setError(null);
    setInfo(null);

    if (!token) {
      setError("Gecersiz sifre yenileme baglantisi.");
      return;
    }

    if (!newPassword || !confirmPassword) {
      setError("Yeni sifre ve tekrar sifre zorunludur.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Yeni sifre ve tekrar sifresi ayni olmalidir.");
      return;
    }

    if (newPassword.length < 6) {
      setError("Yeni sifre en az 6 karakter olmalidir.");
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(resolveApiUrl("/api/admin/reset-password"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token,
          newPassword,
          confirmPassword,
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { error?: string; message?: string; success?: boolean }
        | null;

      if (!response.ok) {
        throw new Error(payload?.error || "Sifre yenileme basarisiz.");
      }

      setInfo(payload?.message || "Sifreniz basariyla guncellendi.");
      setNewPassword("");
      setConfirmPassword("");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Sifre yenileme basarisiz.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: "linear-gradient(135deg, #1a237e 0%, #1565C0 40%, #0097A7 75%, #004d40 100%)" }}
    >
      <Card className="w-full max-w-xl border-t-8 border-t-blue-600 shadow-lg">
        <CardHeader>
          <CardTitle>Admin Sifre Yenileme</CardTitle>
          <CardDescription>
            Mailde gelen baglanti ile yeni sifrenizi belirleyin.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            placeholder="Yeni sifre"
          />
          <Input
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            placeholder="Yeni sifre (tekrar)"
          />
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={isLoading || !token || !newPassword.trim() || !confirmPassword.trim()}
            className="w-full"
          >
            {isLoading ? "Guncelleniyor..." : "Guncelle"}
          </Button>
          {error && <p className="text-sm text-red-600">{error}</p>}
          {info && <p className="text-sm text-blue-700">{info}</p>}
          <Button type="button" variant="outline" className="w-full" onClick={() => (window.location.href = "/")}>Ana Sayfaya Don</Button>
        </CardContent>
      </Card>
    </div>
  );
}
