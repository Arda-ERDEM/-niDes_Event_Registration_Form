import { useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Plus, Trash2, CheckCircle2, AlertCircle } from "lucide-react";
import { useSubmitRegistration } from "@workspace/api-client-react";

import { Button } from "@/components/ui/button";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

const participantSchema = z.object({
  tcKimlik: z.string().length(11, "TC Kimlik No tam olarak 11 haneli olmalıdır").regex(/^\d+$/, "TC Kimlik No sadece rakamlardan oluşmalıdır"),
  isimSoyisim: z.string().min(2, "İsim soyisim zorunludur"),
  gelinenYer: z.string().min(2, "Geldiği yer zorunludur"),
  telefon: z.string().min(10, "Geçerli bir telefon numarası giriniz"),
  email: z.string().email("Geçerli bir e-posta adresi giriniz"),
  isKaptan: z.boolean().default(false),
});

const formSchema = z.object({
  takimAdi: z.string().min(2, "Takım adı zorunludur"),
  takimNumarasi: z.coerce.number({ invalid_type_error: "Lütfen bir takım numarası seçin" }).min(1).max(15),
  katilimcilar: z.array(participantSchema)
    .min(2, "Bir takımda en az 2 katılımcı olmalıdır")
    .max(4, "Bir takımda en fazla 4 katılımcı olabilir")
    .refine((data) => data.filter((p) => p.isKaptan).length === 1, {
      message: "Takımda tam olarak bir kişi kaptan olmalıdır",
    }),
});

type FormValues = z.infer<typeof formSchema>;

export default function Home() {
  const [isSuccess, setIsSuccess] = useState(false);
  const [successData, setSuccessData] = useState<{ takimAdi: string; count: number } | null>(null);
  
  const submitRegistration = useSubmitRegistration();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      takimAdi: "",
      katilimcilar: [
        { tcKimlik: "", isimSoyisim: "", gelinenYer: "", telefon: "", email: "", isKaptan: true },
        { tcKimlik: "", isimSoyisim: "", gelinenYer: "", telefon: "", email: "", isKaptan: false },
      ],
    },
  });

  const { fields, append, remove } = useFieldArray({
    name: "katilimcilar",
    control: form.control,
  });

  const onSubmit = (data: FormValues) => {
    submitRegistration.mutate(
      { data },
      {
        onSuccess: () => {
          setSuccessData({ takimAdi: data.takimAdi, count: data.katilimcilar.length });
          setIsSuccess(true);
        },
        onError: (error) => {
          console.error("Registration error:", error);
        },
      }
    );
  };

  const handleCaptainChange = (index: number, checked: boolean) => {
    if (!checked) return; // Cannot uncheck if it's the only one (handled by validation)
    
    // Uncheck all other captains
    const currentParticipants = form.getValues("katilimcilar");
    currentParticipants.forEach((_, i) => {
      form.setValue(`katilimcilar.${i}.isKaptan`, i === index);
    });
  };

  if (isSuccess && successData) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <Card className="w-full max-w-md border-t-8 border-t-green-500 shadow-lg text-center p-6">
          <div className="flex justify-center mb-6">
            <CheckCircle2 className="h-20 w-20 text-green-500" />
          </div>
          <CardTitle className="text-3xl mb-4 font-bold text-gray-900">Kayıt Başarılı!</CardTitle>
          <CardDescription className="text-lg text-gray-600 mb-8">
            <strong className="text-gray-900">{successData.takimAdi}</strong> takımı ({successData.count} kişi) başarıyla kaydedildi. Kaptanın e-posta adresine bir onay maili gönderilecektir.
          </CardDescription>
          <Button 
            data-testid="button-new-registration"
            onClick={() => {
              form.reset();
              setIsSuccess(false);
              setSuccessData(null);
            }}
            className="w-full h-12 text-lg"
          >
            Yeni Bir Kayıt Oluştur
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-3xl mx-auto">
        <div className="flex flex-col items-center mb-8">
          <img 
            src="/gdg-logo.png" 
            alt="Google Developer Groups On Campus" 
            className="h-24 object-contain mb-6 opacity-[0.9]"
            onError={(e) => {
              // Fallback if logo is missing
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
          <h1 className="text-3xl font-bold text-gray-900 text-center">Samsun Üniversitesi Etkinlik Kayıt Formu</h1>
          <p className="mt-2 text-gray-600 text-center max-w-xl">
            Google Developer Groups On Campus Samsun Üniversitesi resmi etkinlik kayıt formuna hoş geldiniz. Takımınızı oluşturun ve etkinliğe katılın!
          </p>
        </div>

        <Card className="shadow-lg border-t-8 border-t-primary">
          <CardHeader>
            <CardTitle className="text-2xl text-gray-900">Takım Bilgileri</CardTitle>
            <CardDescription>Lütfen takımınızın adını ve numarasını belirleyin.</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                
                {submitRegistration.isError && (
                  <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-md flex items-start gap-3" data-testid="status-error">
                    <AlertCircle className="h-5 w-5 mt-0.5" />
                    <div>
                      <h4 className="font-semibold">Kayıt sırasında bir hata oluştu</h4>
                      <p className="text-sm mt-1">{submitRegistration.error?.error || "Lütfen daha sonra tekrar deneyiniz."}</p>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="takimAdi"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-gray-700 font-semibold">Takım Adı</FormLabel>
                        <FormControl>
                          <Input data-testid="input-team-name" placeholder="Örn: Geleceğin Yazılımcıları" {...field} className="h-12 bg-white" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="takimNumarasi"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-gray-700 font-semibold">Takım Numarası (1-15)</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value?.toString()}>
                          <FormControl>
                            <SelectTrigger data-testid="select-team-number" className="h-12 bg-white">
                              <SelectValue placeholder="Bir takım numarası seçin" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {Array.from({ length: 15 }, (_, i) => i + 1).map((num) => (
                              <SelectItem key={num} value={num.toString()}>
                                Takım {num}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="pt-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-xl font-bold text-gray-900">Katılımcı Bilgileri</h3>
                      <p className="text-sm text-gray-500">En az 2, en fazla 4 katılımcı ekleyebilirsiniz. Bir kişi kaptan olmalıdır.</p>
                    </div>
                    {fields.length < 4 && (
                      <Button
                        type="button"
                        variant="outline"
                        data-testid="button-add-participant"
                        onClick={() => append({ tcKimlik: "", isimSoyisim: "", gelinenYer: "", telefon: "", email: "", isKaptan: false })}
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
                          <h4 className="font-bold text-lg text-gray-800">
                            {index + 1}. Katılımcı
                          </h4>
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
                                  <Input data-testid={`input-tc-kimlik-${index}`} placeholder="11 haneli TC kimlik no" maxLength={11} {...field} className="bg-white" />
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
                                  <Input data-testid={`input-email-${index}`} placeholder="ornek@ogrenci.samsun.edu.tr" type="email" {...field} className="bg-white" />
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
                                <FormLabel className="font-bold text-gray-900 cursor-pointer">
                                  Takım Kaptanı
                                </FormLabel>
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
                  disabled={submitRegistration.isPending}
                >
                  {submitRegistration.isPending ? "Kaydediliyor..." : "Kaydı Tamamla"}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
