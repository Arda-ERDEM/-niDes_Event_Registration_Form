import { useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { AlertCircle, CheckCircle2, Plus, Save, ShieldCheck, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

const participantSchema = z.object({
  tcKimlik: z
    .string()
    .length(11, "TC Kimlik No tam olarak 11 haneli olmalıdır")
    .regex(/^\d+$/, "TC Kimlik No sadece rakamlardan oluşmalıdır"),
  isimSoyisim: z.string().min(2, "İsim soyisim zorunludur"),
  gelinenYer: z.string().min(2, "Geldiği yer zorunludur"),
  telefon: z.string().min(10, "Geçerli bir telefon numarası giriniz"),
  email: z.string().email("Geçerli bir e-posta adresi giriniz"),
  isKaptan: z.boolean().default(false),
  universite: z.string().min(2, "Üniversite adı zorunludur"),
  bolum: z.string().min(2, "Bölüm adı zorunludur"),
});

const formSchema = z.object({
  takimAdi: z.string().min(2, "Takım adı zorunludur"),
  katilimcilar: z
    .array(participantSchema)
    .min(2, "Bir takımda en az 2 katılımcı olmalıdır")
    .max(4, "Bir takımda en fazla 4 katılımcı olabilir")
    .refine((data) => data.filter((p) => p.isKaptan).length === 1, {
      message: "Takımda tam olarak bir kişi kaptan olmalıdır",
    }),
});

type FormValues = z.infer<typeof formSchema>;

type AdminParticipant = {
  tcKimlik: string;
  isimSoyisim: string;
  gelinenYer: string;
  telefon: string;
  email: string;
  isKaptan: boolean;
  universite: string;
  bolum: string;
};

type AdminRegistration = {
  id: string;
  createdAt: string;
  takimAdi: string;
  katilimcilar: AdminParticipant[];
};

type AdminEditDraft = {
  takimAdi: string;
  katilimcilar: AdminParticipant[];
};

type SlotAssignment = {
  slot: number;
  registrationId: string;
};

const MAX_SELECTED_TEAM_COUNT = 15;
const TEAM_SLOT_NUMBERS = Array.from({ length: MAX_SELECTED_TEAM_COUNT }, (_, index) => index + 1);

const createDefaultParticipants = (): FormValues["katilimcilar"] => [
  {
    tcKimlik: "",
    isimSoyisim: "",
    gelinenYer: "",
    telefon: "",
    email: "",
    isKaptan: true,
    universite: "",
    bolum: "",
  },
  {
    tcKimlik: "",
    isimSoyisim: "",
    gelinenYer: "",
    telefon: "",
    email: "",
    isKaptan: false,
    universite: "",
    bolum: "",
  },
];

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

function createEmptyParticipant(): AdminParticipant {
  return {
    tcKimlik: "",
    isimSoyisim: "",
    gelinenYer: "",
    telefon: "",
    email: "",
    isKaptan: false,
    universite: "",
    bolum: "",
  };
}

export default function Home() {
  const [isSuccess, setIsSuccess] = useState(false);
  const [successData, setSuccessData] = useState<{ takimAdi: string; count: number } | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [isAdminDialogOpen, setIsAdminDialogOpen] = useState(false);
  const [adminPassword, setAdminPassword] = useState("");
  const [adminError, setAdminError] = useState<string | null>(null);
  const [adminInfo, setAdminInfo] = useState<string | null>(null);
  const [isAdminLoading, setIsAdminLoading] = useState(false);
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(false);
  const [adminRegistrations, setAdminRegistrations] = useState<AdminRegistration[]>([]);
  const [slotAssignments, setSlotAssignments] = useState<SlotAssignment[]>([]);
  const [adminSearchQuery, setAdminSearchQuery] = useState("");
  const [editingRegistrationId, setEditingRegistrationId] = useState<string | null>(null);
  const [adminEditDraft, setAdminEditDraft] = useState<AdminEditDraft | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      takimAdi: "",
      katilimcilar: createDefaultParticipants(),
    },
  });

  const { fields, append, remove } = useFieldArray({
    name: "katilimcilar",
    control: form.control,
  });

  const handleCaptainChange = (index: number, checked: boolean) => {
    if (!checked) return;
    const currentParticipants = form.getValues("katilimcilar");
    currentParticipants.forEach((_, i) => {
      form.setValue(`katilimcilar.${i}.isKaptan`, i === index);
    });
  };

  const onSubmit = async (data: FormValues) => {
    setSubmitError(null);
    setIsSubmitting(true);
    try {
      const response = await fetch(resolveApiUrl("/api/register"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });

      const payload = (await response.json().catch(() => null)) as
        | { message?: string; error?: string }
        | null;

      if (!response.ok) {
        throw new Error(payload?.error || payload?.message || "Kayıt sırasında bir hata oluştu.");
      }

      setSuccessData({ takimAdi: data.takimAdi, count: data.katilimcilar.length });
      setIsSuccess(true);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Kayıt sırasında bir hata oluştu.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const fetchAdminRegistrations = async (password: string): Promise<AdminRegistration[]> => {
    const response = await fetch(resolveApiUrl("/api/admin/registrations"), {
      headers: {
        "x-admin-password": password,
      },
    });

    const payload = (await response.json().catch(() => null)) as
      | { error?: string; registrations?: AdminRegistration[]; slotAssignments?: SlotAssignment[] }
      | null;

    if (!response.ok) {
      throw new Error(payload?.error || "Admin verileri alınamadı.");
    }

    setSlotAssignments(payload?.slotAssignments ?? []);
    return payload?.registrations ?? [];
  };

  const handleAdminLogin = async () => {
    setAdminError(null);
    setAdminInfo(null);
    setIsAdminLoading(true);
    try {
      const loginResponse = await fetch(resolveApiUrl("/api/admin/login"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ password: adminPassword }),
      });

      const loginPayload = (await loginResponse.json().catch(() => null)) as
        | { error?: string; registrations?: AdminRegistration[]; slotAssignments?: SlotAssignment[] }
        | null;

      if (!loginResponse.ok) {
        throw new Error(loginPayload?.error || "Admin girişi başarısız.");
      }

      setAdminRegistrations(loginPayload?.registrations ?? []);
      setSlotAssignments(loginPayload?.slotAssignments ?? []);
      setIsAdminLoggedIn(true);
    } catch (error) {
      setAdminError(error instanceof Error ? error.message : "Admin girişi başarısız.");
    } finally {
      setIsAdminLoading(false);
    }
  };

  const handleAdminForgotPassword = async () => {
    setAdminError(null);
    setAdminInfo(null);
    setIsAdminLoading(true);

    try {
      const response = await fetch(resolveApiUrl("/api/admin/forgot-password"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      const payload = (await response.json().catch(() => null)) as
        | { error?: string; message?: string; success?: boolean }
        | null;

      if (!response.ok) {
        throw new Error(payload?.error || "Sifre sifirlama basarisiz.");
      }

      setAdminInfo(payload?.message || "Sifre yenileme baglantisi e-posta adresinize gonderildi.");
    } catch (error) {
      setAdminError(error instanceof Error ? error.message : "Sifre sifirlama basarisiz.");
    } finally {
      setIsAdminLoading(false);
    }
  };

  const refreshAdminRegistrations = async () => {
    setAdminError(null);
    setAdminInfo(null);
    setIsAdminLoading(true);
    try {
      const data = await fetchAdminRegistrations(adminPassword);
      setAdminRegistrations(data);
    } catch (error) {
      setAdminError(error instanceof Error ? error.message : "Liste yenilenemedi.");
    } finally {
      setIsAdminLoading(false);
    }
  };

  const openAdminDialog = () => {
    setAdminError(null);
    setAdminInfo(null);
    setIsAdminDialogOpen(true);
  };

  const closeAdminDialog = () => {
    setIsAdminDialogOpen(false);
    setIsAdminLoggedIn(false);
    setAdminError(null);
    setAdminInfo(null);
    setAdminPassword("");
    setAdminRegistrations([]);
    setSlotAssignments([]);
    setAdminSearchQuery("");
    setEditingRegistrationId(null);
    setAdminEditDraft(null);
  };

  const assignTeamToSlot = async (registrationId: string, slot: number | null) => {
    setAdminError(null);
    setIsAdminLoading(true);
    try {
      const response = await fetch(resolveApiUrl(`/api/admin/team-slot-assignment/${encodeURIComponent(registrationId)}`), {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-admin-password": adminPassword,
        },
        body: JSON.stringify({ slot }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { error?: string; slotAssignments?: SlotAssignment[] }
        | null;

      if (!response.ok) {
        throw new Error(payload?.error || "Takım ataması güncellenemedi.");
      }

      setSlotAssignments(payload?.slotAssignments ?? []);
    } catch (error) {
      setAdminError(error instanceof Error ? error.message : "Takım ataması güncellenemedi.");
    } finally {
      setIsAdminLoading(false);
    }
  };

  const sendNotifications = async () => {
    setAdminError(null);
    setIsAdminLoading(true);
    try {
      const response = await fetch(resolveApiUrl("/api/admin/send-notifications"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-password": adminPassword,
        },
      });

      const payload = (await response.json().catch(() => null)) as
        | { error?: string; message?: string; success?: boolean }
        | null;

      if (!response.ok) {
        throw new Error(payload?.error || "Bildirimler gönderilemedi.");
      }

      setAdminError(null);
      alert(payload?.message || "Seçilen takımlar başarıyla bilgilendirildi!");
    } catch (error) {
      if (error instanceof TypeError) {
        setAdminError("Sunucuya baglanilamadi. API sunucusunun 3001 portunda calistigindan emin olun.");
      } else {
        setAdminError(error instanceof Error ? error.message : "Bildirimler gönderilemedi.");
      }
    } finally {
      setIsAdminLoading(false);
    }
  };

  const startEditingRegistration = (registration: AdminRegistration) => {
    setAdminError(null);
    setEditingRegistrationId(registration.id);
    setAdminEditDraft({
      takimAdi: registration.takimAdi,
      katilimcilar: registration.katilimcilar.map((participant) => ({ ...participant })),
    });
  };

  const cancelEditingRegistration = () => {
    setEditingRegistrationId(null);
    setAdminEditDraft(null);
    setAdminError(null);
  };

  const updateDraftParticipant = (
    index: number,
    field: keyof AdminParticipant,
    value: string | boolean,
  ) => {
    setAdminEditDraft((prev) => {
      if (!prev) return prev;
      const nextParticipants = [...prev.katilimcilar];
      nextParticipants[index] = {
        ...nextParticipants[index],
        [field]: value,
      } as AdminParticipant;

      return {
        ...prev,
        katilimcilar: nextParticipants,
      };
    });
  };

  const updateDraftCaptain = (index: number, checked: boolean) => {
    if (!checked) return;

    setAdminEditDraft((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        katilimcilar: prev.katilimcilar.map((participant, participantIndex) => ({
          ...participant,
          isKaptan: participantIndex === index,
        })),
      };
    });
  };

  const addDraftParticipant = () => {
    setAdminEditDraft((prev) => {
      if (!prev || prev.katilimcilar.length >= 4) return prev;
      return {
        ...prev,
        katilimcilar: [...prev.katilimcilar, createEmptyParticipant()],
      };
    });
  };

  const removeDraftParticipant = (index: number) => {
    setAdminEditDraft((prev) => {
      if (!prev || prev.katilimcilar.length <= 2) return prev;

      const nextParticipants = prev.katilimcilar.filter((_, participantIndex) => participantIndex !== index);
      const hasCaptain = nextParticipants.some((participant) => participant.isKaptan);

      if (!hasCaptain && nextParticipants.length > 0) {
        nextParticipants[0] = {
          ...nextParticipants[0],
          isKaptan: true,
        };
      }

      return {
        ...prev,
        katilimcilar: nextParticipants,
      };
    });
  };

  const saveEditingRegistration = async (registrationId: string) => {
    if (!adminEditDraft) return;

    const parsed = formSchema.safeParse(adminEditDraft);
    if (!parsed.success) {
      setAdminError(parsed.error.issues[0]?.message ?? "Geçersiz kayıt bilgileri.");
      return;
    }

    setAdminError(null);
    setIsAdminLoading(true);
    try {
      const response = await fetch(resolveApiUrl(`/api/admin/registrations/${encodeURIComponent(registrationId)}`), {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-admin-password": adminPassword,
        },
        body: JSON.stringify(parsed.data),
      });

      const payload = (await response.json().catch(() => null)) as
        | { error?: string; registration?: AdminRegistration }
        | null;

      if (!response.ok) {
        throw new Error(payload?.error || "Kayıt güncellenemedi.");
      }

      const updated = payload?.registration;
      if (!updated) {
        throw new Error("Güncellenen kayıt alınamadı.");
      }

      setAdminRegistrations((prev) => prev.map((record) => (record.id === registrationId ? updated : record)));
      setEditingRegistrationId(null);
      setAdminEditDraft(null);
    } catch (error) {
      setAdminError(error instanceof Error ? error.message : "Kayıt güncellenemedi.");
    } finally {
      setIsAdminLoading(false);
    }
  };

  const deleteRegistration = async (registrationId: string) => {
    const confirmed = window.confirm("Bu kaydı silmek istediğinize emin misiniz?");
    if (!confirmed) return;

    setAdminError(null);
    setIsAdminLoading(true);
    try {
      const response = await fetch(resolveApiUrl(`/api/admin/registrations/${encodeURIComponent(registrationId)}`), {
        method: "DELETE",
        headers: {
          "x-admin-password": adminPassword,
        },
      });

      const payload = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        throw new Error(payload?.error || "Kayıt silinemedi.");
      }

      setAdminRegistrations((prev) => prev.filter((record) => record.id !== registrationId));
      setSlotAssignments((prev) => prev.filter((entry) => entry.registrationId !== registrationId));
      if (editingRegistrationId === registrationId) {
        setEditingRegistrationId(null);
        setAdminEditDraft(null);
      }
    } catch (error) {
      setAdminError(error instanceof Error ? error.message : "Kayıt silinemedi.");
    } finally {
      setIsAdminLoading(false);
    }
  };

  const getAssignedSlotForTeam = (registrationId: string): number | null => {
    const assignment = slotAssignments.find((entry) => entry.registrationId === registrationId);
    return assignment?.slot ?? null;
  };

  const getAssignedTeamForSlot = (slot: number): string | null => {
    const assignment = slotAssignments.find((entry) => entry.slot === slot);
    return assignment?.registrationId ?? null;
  };

  const filteredAdminRegistrations = adminRegistrations.filter((registration) =>
    registration.takimAdi.toLocaleLowerCase("tr-TR").includes(adminSearchQuery.trim().toLocaleLowerCase("tr-TR")),
  );

  const renderAdminDialogContent = (passwordInputId: string, description: string) => (
    <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Admin Paneli</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>

      {!isAdminLoggedIn ? (
        <div className="space-y-3">
          <label htmlFor={passwordInputId} className="text-sm font-medium text-gray-900">
            Admin Şifresi
          </label>
          <Input
            id={passwordInputId}
            type="password"
            value={adminPassword}
            onChange={(event) => setAdminPassword(event.target.value)}
            placeholder="Şifrenizi girin"
            data-testid="input-admin-password"
          />
          <div className="flex justify-end">
            <Button
              type="button"
              variant="link"
              className="h-auto px-0 text-sm"
              disabled={isAdminLoading}
              onClick={handleAdminForgotPassword}
            >
              Şifremi Unuttum
            </Button>
          </div>
          {adminError && <p className="text-sm text-red-600">{adminError}</p>}
          {adminInfo && <p className="text-sm text-blue-700">{adminInfo}</p>}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-gray-600">Toplam başvuru: {adminRegistrations.length}</p>
            <Button type="button" variant="outline" size="sm" onClick={refreshAdminRegistrations} disabled={isAdminLoading}>
              Yenile
            </Button>
          </div>

          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <p className="text-sm font-semibold text-gray-900 mb-2">Final 15 Takım Slotları (Dolu / Müsait)</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              {TEAM_SLOT_NUMBERS.map((slot) => {
                const assignedTeamId = getAssignedTeamForSlot(slot);
                const assignedTeam = adminRegistrations.find((registration) => registration.id === assignedTeamId);

                return (
                  <div
                    key={`slot-${slot}`}
                    className={`rounded-md border p-2 text-xs ${
                      assignedTeam ? "border-green-300 bg-green-50" : "border-gray-200 bg-white"
                    }`}
                  >
                    <p className="font-semibold text-gray-900">{slot}. Takım</p>
                    <p className={assignedTeam ? "text-green-700" : "text-gray-500"}>
                      {assignedTeam ? assignedTeam.takimAdi : "Müsait"}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="team-search" className="text-sm font-medium text-gray-900">
              Takım Adına Göre Ara
            </label>
            <Input
              id="team-search"
              value={adminSearchQuery}
              onChange={(event) => setAdminSearchQuery(event.target.value)}
              placeholder="Takım adı yazın"
            />
          </div>

          {slotAssignments.length > 0 && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
              <p className="text-sm font-semibold text-blue-900 mb-3">
                ✅ {slotAssignments.length} Takım Seçildi - Tüm Bilgilerini Gönder
              </p>
              <Button
                type="button"
                onClick={sendNotifications}
                disabled={isAdminLoading || slotAssignments.length === 0}
                className="w-full bg-blue-600 hover:bg-blue-700"
              >
                Seçilenleri Bildir (ardaerdem.sweng@gmail.com)
              </Button>
            </div>
          )}

          {adminRegistrations.length === 0 ? (
            <p className="text-sm text-gray-600">Henüz kayıt bulunmuyor.</p>
          ) : filteredAdminRegistrations.length === 0 ? (
            <p className="text-sm text-gray-600">Arama kriterine uyan takım bulunamadı.</p>
          ) : (
            <div className="space-y-3">
              {filteredAdminRegistrations.map((registration) => {
                const isEditing = editingRegistrationId === registration.id && adminEditDraft !== null;
                const assignedSlot = getAssignedSlotForTeam(registration.id);

                return (
                  <div key={registration.id} className="rounded-lg border border-gray-200 bg-white p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-xs text-gray-500">{new Date(registration.createdAt).toLocaleString("tr-TR")}</p>
                      <div className="flex gap-2">
                        <select
                          value={assignedSlot ?? ""}
                          onChange={(event) => {
                            const value = event.target.value;
                            const nextSlot = value === "" ? null : Number(value);
                            void assignTeamToSlot(registration.id, Number.isNaN(nextSlot) ? null : nextSlot);
                          }}
                          disabled={isAdminLoading}
                          className="h-9 rounded-md border border-gray-300 bg-white px-2 text-sm"
                        >
                          <option value="">Atama Yok</option>
                          {TEAM_SLOT_NUMBERS.map((slot) => {
                            const occupiedTeamId = getAssignedTeamForSlot(slot);
                            const occupiedTeam = adminRegistrations.find((record) => record.id === occupiedTeamId);
                            const occupiedByAnother = occupiedTeamId && occupiedTeamId !== registration.id;
                            return (
                              <option key={`${registration.id}-slot-${slot}`} value={slot}>
                                {occupiedByAnother
                                  ? `${slot}. Takım (Dolu: ${occupiedTeam?.takimAdi ?? "Diğer Takım"})`
                                  : `${slot}. Takım`}
                              </option>
                            );
                          })}
                        </select>
                        {isEditing ? (
                          <>
                            <Button type="button" size="sm" onClick={() => saveEditingRegistration(registration.id)} disabled={isAdminLoading}>
                              <Save className="h-4 w-4 mr-2" />
                              Kaydet
                            </Button>
                            <Button type="button" variant="outline" size="sm" onClick={cancelEditingRegistration} disabled={isAdminLoading}>
                              <X className="h-4 w-4 mr-2" />
                              Vazgeç
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button type="button" variant="outline" size="sm" onClick={() => startEditingRegistration(registration)} disabled={isAdminLoading}>
                              Düzenle
                            </Button>
                            <Button type="button" variant="destructive" size="sm" onClick={() => deleteRegistration(registration.id)} disabled={isAdminLoading}>
                              Sil
                            </Button>
                          </>
                        )}
                      </div>
                    </div>

                    {isEditing && adminEditDraft ? (
                      <div className="mt-3 space-y-4">
                        <div>
                          <label className="text-sm font-medium text-gray-900">Takım Adı</label>
                          <Input
                            value={adminEditDraft.takimAdi}
                            onChange={(event) =>
                              setAdminEditDraft((prev) => (prev ? { ...prev, takimAdi: event.target.value } : prev))
                            }
                            className="mt-1"
                          />
                        </div>

                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium text-gray-900">Katılımcılar</p>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={addDraftParticipant}
                            disabled={adminEditDraft.katilimcilar.length >= 4}
                          >
                            <Plus className="h-4 w-4 mr-2" />
                            Katılımcı Ekle
                          </Button>
                        </div>

                        <div className="space-y-3">
                          {adminEditDraft.katilimcilar.map((person, index) => (
                            <div key={`${registration.id}-edit-${index}`} className="rounded-md border border-gray-100 bg-gray-50 p-3">
                              <div className="mb-2 flex items-center justify-between">
                                <p className="font-medium text-gray-900">{index + 1}. Katılımcı</p>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => removeDraftParticipant(index)}
                                  disabled={adminEditDraft.katilimcilar.length <= 2}
                                  className="text-red-600 hover:text-red-700"
                                >
                                  <Trash2 className="h-4 w-4 mr-1" />
                                  Sil
                                </Button>
                              </div>

                              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                                <Input value={person.isimSoyisim} onChange={(event) => updateDraftParticipant(index, "isimSoyisim", event.target.value)} placeholder="İsim Soyisim" />
                                <Input value={person.tcKimlik} onChange={(event) => updateDraftParticipant(index, "tcKimlik", event.target.value)} placeholder="TC Kimlik No" />
                                <Input value={person.gelinenYer} onChange={(event) => updateDraftParticipant(index, "gelinenYer", event.target.value)} placeholder="Geldiği Yer" />
                                <Input value={person.telefon} onChange={(event) => updateDraftParticipant(index, "telefon", event.target.value)} placeholder="Telefon" />
                                <Input value={person.email} onChange={(event) => updateDraftParticipant(index, "email", event.target.value)} placeholder="E-posta" />
                                <Input value={person.universite} onChange={(event) => updateDraftParticipant(index, "universite", event.target.value)} placeholder="Üniversite" />
                                <Input value={person.bolum} onChange={(event) => updateDraftParticipant(index, "bolum", event.target.value)} placeholder="Bölüm" />
                                <label className="flex items-center gap-2 rounded-md border bg-white px-3 py-2 text-sm text-gray-700">
                                  <Checkbox checked={person.isKaptan} onCheckedChange={(checked) => updateDraftCaptain(index, checked === true)} />
                                  Takım Kaptanı
                                </label>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <>
                        <h4 className="mt-3 font-semibold text-gray-900">
                          {registration.takimAdi}
                          {assignedSlot ? (
                            <span className="ml-2 rounded bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700">
                              {assignedSlot}. Takım Slotu
                            </span>
                          ) : null}
                        </h4>
                        <div className="mt-2 space-y-2">
                          {registration.katilimcilar.map((person, index) => (
                            <div key={`${registration.id}-${index}`} className="rounded-md border border-gray-100 bg-gray-50 px-3 py-2 text-sm">
                              <p className="font-medium text-gray-900">
                                {person.isimSoyisim} {person.isKaptan ? "(Kaptan)" : ""}
                              </p>
                              <p className="text-gray-600">{person.email} - {person.telefon}</p>
                              <p className="text-gray-500">{person.universite} / {person.bolum}</p>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {adminError && <p className="text-sm text-red-600">{adminError}</p>}
        </div>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={closeAdminDialog}>
          Kapat
        </Button>
        {!isAdminLoggedIn && (
          <Button type="button" onClick={handleAdminLogin} disabled={isAdminLoading || !adminPassword.trim()}>
            {isAdminLoading ? "Giriş yapılıyor..." : "Giriş Yap"}
          </Button>
        )}
      </DialogFooter>
    </DialogContent>
  );

  if (isSuccess && successData) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center p-4"
        style={{ background: "linear-gradient(135deg, #1a237e 0%, #1565C0 40%, #0097A7 75%, #004d40 100%)" }}
      >
        <Card className="w-full max-w-md border-t-8 border-t-green-500 shadow-lg text-center p-6">
          <div className="flex justify-center mb-6">
            <CheckCircle2 className="h-20 w-20 text-green-500" />
          </div>
          <CardTitle className="text-3xl mb-4 font-bold text-gray-900">Kayıt Başarılı!</CardTitle>
          <CardDescription className="text-lg text-gray-600 mb-8">
            <strong className="text-gray-900">{successData.takimAdi}</strong> takımı ({successData.count} kişi)
            başarıyla kaydedildi.
          </CardDescription>
          <div className="flex flex-col gap-3">
            <Button
              data-testid="button-new-registration"
              onClick={() => {
                form.reset({
                  takimAdi: "",
                  katilimcilar: createDefaultParticipants(),
                });
                setIsSuccess(false);
                setSuccessData(null);
              }}
              className="w-full h-12 text-lg"
            >
              Yeni Bir Kayıt Oluştur
            </Button>
            <Button
              type="button"
              variant="outline"
              data-testid="button-admin-panel-success"
              onClick={openAdminDialog}
            >
              <ShieldCheck className="h-4 w-4 mr-2" />
              Admin Paneli
            </Button>
          </div>
        </Card>

        <Dialog open={isAdminDialogOpen} onOpenChange={(open) => (open ? openAdminDialog() : closeAdminDialog())}>
          {renderAdminDialogContent("admin-password-success", "Kayıtlı başvuruları bu panelden yönetebilirsiniz.")}
        </Dialog>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen overflow-x-hidden py-10 px-4 sm:px-6 lg:px-8 font-sans"
      style={{ background: "linear-gradient(135deg, #1a237e 0%, #1565C0 40%, #0097A7 75%, #004d40 100%)" }}
    >
      <div className="max-w-3xl mx-auto">
        <div className="flex flex-col items-center mb-8">
          <div className="mb-6 flex w-full flex-col items-center gap-3 sm:w-auto sm:flex-row sm:items-center sm:justify-center sm:gap-2 md:gap-3">
            <div className="w-full max-w-[320px] sm:w-auto sm:max-w-none flex items-center justify-center sm:justify-start gap-2 sm:gap-3 min-w-0">
              <svg className="w-14 h-auto sm:w-16 md:w-20 shrink-0" viewBox="0 0 150 80" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <rect x="22" y="31" width="52" height="18" rx="9" fill="#DB4437" transform="rotate(-28 22 40)" />
                <rect x="22" y="31" width="52" height="18" rx="9" fill="#4285F4" transform="rotate(28 22 40)" />
                <rect x="76" y="31" width="52" height="18" rx="9" fill="#0F9D58" transform="rotate(-28 128 40)" />
                <rect x="76" y="31" width="52" height="18" rx="9" fill="#F4B400" transform="rotate(28 128 40)" />
              </svg>
              <div className="flex flex-col min-w-0 text-left">
                <span className="text-white font-bold text-sm sm:text-base md:text-xl leading-tight tracking-tight drop-shadow whitespace-normal break-words">
                  Google Developer Groups
                </span>
                <span className="text-white/80 text-[11px] sm:text-xs md:text-sm font-medium tracking-wide whitespace-normal break-words">
                  On Campus · Samsun University
                </span>
              </div>
            </div>

            <div className="w-14 h-px bg-white/30 sm:w-px sm:h-11 md:h-12 flex-shrink-0" />

            <div className="w-full max-w-[320px] sm:w-auto sm:max-w-none flex items-center justify-center sm:justify-start gap-1 sm:gap-2 min-w-0">
              <svg className="w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 shrink-0" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <polygon points="32,5 39,22 25,22" fill="#CC2222" />
                <polygon points="59,32 42,25 42,39" fill="#777" />
                <polygon points="32,59 25,42 39,42" fill="#AAA" />
                <polygon points="5,32 22,25 22,39" fill="#888" />
              </svg>
              <div className="flex flex-col min-w-0 text-left">
                <span className="text-white font-extrabold text-sm sm:text-base md:text-xl leading-tight tracking-[0.06em] sm:tracking-[0.08em] md:tracking-widest drop-shadow whitespace-normal break-words">
                  TEKN<span className="text-red-500 font-black">O</span>PARK
                </span>
                <span className="text-white/80 text-[11px] sm:text-xs md:text-sm font-semibold tracking-[0.14em] sm:tracking-[0.2em] md:tracking-[0.3em]">SAMSUN</span>
              </div>
            </div>
          </div>

          <h1 className="text-3xl font-bold text-white text-center drop-shadow">Etkinlik Kayıt Formu</h1>
          <p className="mt-2 text-white/90 text-center max-w-xl">
            Google Developer Groups On Campus Samsun Üniversitesi resmi etkinlik kayıt formuna hoş geldiniz.
            Takımınızı oluşturun ve etkinliğe katılın.
          </p>
        </div>

        <Card className="shadow-lg border-t-8 border-t-primary">
          <CardHeader>
            <CardTitle className="text-2xl text-gray-900">Takım Bilgileri</CardTitle>
            <CardDescription>Lütfen takımınızı oluşturan katılımcı bilgilerini girin.</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                {submitError && (
                  <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-md flex items-start gap-3" data-testid="status-error">
                    <AlertCircle className="h-5 w-5 mt-0.5" />
                    <div>
                      <h4 className="font-semibold">Kayıt sırasında bir hata oluştu</h4>
                      <p className="text-sm mt-1">{submitError}</p>
                    </div>
                  </div>
                )}

                <FormField
                  control={form.control}
                  name="takimAdi"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-gray-700 font-semibold">Takım Adı</FormLabel>
                      <FormControl>
                        <Input
                          data-testid="input-team-name"
                          placeholder="Örn: Geleceğin Yazılımcıları"
                          {...field}
                          className="h-12 bg-white"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="pt-2">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                    <div>
                      <h3 className="text-xl font-bold text-gray-900">Katılımcı Bilgileri</h3>
                      <p className="text-sm text-gray-500">En az 2, en fazla 4 katılımcı ekleyebilirsiniz. Bir kişi kaptan olmalıdır.</p>
                    </div>
                    {fields.length < 4 && (
                      <Button
                        type="button"
                        variant="outline"
                        data-testid="button-add-participant"
                        onClick={() =>
                          append({
                            tcKimlik: "",
                            isimSoyisim: "",
                            gelinenYer: "",
                            telefon: "",
                            email: "",
                            isKaptan: false,
                            universite: "",
                            bolum: "",
                          })
                        }
                        className="flex items-center gap-2 border-primary text-primary hover:bg-primary/10"
                      >
                        <Plus className="h-4 w-4" />
                        Katılımcı Ekle
                      </Button>
                    )}
                  </div>

                  {form.formState.errors.katilimcilar?.root && (
                    <p className="text-red-500 text-sm mb-4 font-medium">{form.formState.errors.katilimcilar.root.message}</p>
                  )}

                  <div className="space-y-6">
                    {fields.map((field, index) => (
                      <div key={field.id} className="relative bg-gray-50/50 p-6 rounded-xl border border-gray-200">
                        <div className="flex justify-between items-center mb-4">
                          <h4 className="font-bold text-lg text-gray-800">{index + 1}. Katılımcı</h4>
                          {fields.length > 2 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              data-testid={`button-remove-participant-${index}`}
                              onClick={() => remove(index)}
                              className="text-red-500 hover:text-red-700 hover:bg-red-50 h-8 px-3"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Sil
                            </Button>
                          )}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                          <FormField
                            control={form.control}
                            name={`katilimcilar.${index}.isimSoyisim`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>İsim Soyisim</FormLabel>
                                <FormControl>
                                  <Input data-testid={`input-isim-soyisim-${index}`} placeholder="Ahmet Yılmaz" {...field} className="bg-white" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name={`katilimcilar.${index}.tcKimlik`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>TC Kimlik No</FormLabel>
                                <FormControl>
                                  <Input
                                    data-testid={`input-tc-kimlik-${index}`}
                                    placeholder="11 haneli TC kimlik no"
                                    maxLength={11}
                                    {...field}
                                    className="bg-white"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name={`katilimcilar.${index}.gelinenYer`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Geldiği Yer (İl/İlçe)</FormLabel>
                                <FormControl>
                                  <Input data-testid={`input-gelinen-yer-${index}`} placeholder="Samsun, Atakum" {...field} className="bg-white" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name={`katilimcilar.${index}.telefon`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Telefon Numarası</FormLabel>
                                <FormControl>
                                  <Input data-testid={`input-telefon-${index}`} placeholder="05XX XXX XX XX" {...field} className="bg-white" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name={`katilimcilar.${index}.email`}
                            render={({ field }) => (
                              <FormItem className="md:col-span-2">
                                <FormLabel>E-posta Adresi</FormLabel>
                                <FormControl>
                                  <Input
                                    data-testid={`input-email-${index}`}
                                    placeholder="ornek@ogrenci.samsun.edu.tr"
                                    type="email"
                                    {...field}
                                    className="bg-white"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name={`katilimcilar.${index}.universite`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Üniversite</FormLabel>
                                <FormControl>
                                  <Input data-testid={`input-universite-${index}`} placeholder="Samsun Üniversitesi" {...field} className="bg-white" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name={`katilimcilar.${index}.bolum`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Bölüm</FormLabel>
                                <FormControl>
                                  <Input
                                    data-testid={`input-bolum-${index}`}
                                    placeholder="Bilgisayar Mühendisliği"
                                    {...field}
                                    className="bg-white"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>

                        <Separator className="my-4" />

                        <FormField
                          control={form.control}
                          name={`katilimcilar.${index}.isKaptan`}
                          render={({ field }) => (
                            <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md bg-white p-4 border border-gray-200">
                              <FormControl>
                                <Checkbox
                                  data-testid={`checkbox-kaptan-${index}`}
                                  checked={field.value}
                                  onCheckedChange={(checked) => {
                                    field.onChange(checked);
                                    handleCaptainChange(index, checked === true);
                                  }}
                                  className="h-5 w-5 rounded-sm border-gray-300 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                                />
                              </FormControl>
                              <div className="space-y-1 leading-none">
                                <FormLabel className="font-bold text-gray-900 cursor-pointer">Takım Kaptanı</FormLabel>
                                <FormDescription className="text-gray-500">
                                  Bu katılımcıyı takım kaptanı olarak işaretle.
                                </FormDescription>
                              </div>
                            </FormItem>
                          )}
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <Button
                  type="submit"
                  data-testid="button-submit-registration"
                  className="w-full h-14 text-lg font-bold tracking-wide mt-8 shadow-md"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Kaydediliyor..." : "Kaydı Tamamla"}
                </Button>

                <div className="pt-2 flex justify-center">
                  <Button
                    type="button"
                    variant="outline"
                    data-testid="button-admin-panel"
                    className="w-full sm:w-auto"
                    onClick={openAdminDialog}
                  >
                    <ShieldCheck className="h-4 w-4 mr-2" />
                    Admin Paneli
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>

      <Dialog open={isAdminDialogOpen} onOpenChange={(open) => (open ? openAdminDialog() : closeAdminDialog())}>
        {renderAdminDialogContent("admin-password-main", "Mail'e giden kayıtları bu panelden düzenleyebilir veya silebilirsiniz.")}
      </Dialog>
    </div>
  );
}
