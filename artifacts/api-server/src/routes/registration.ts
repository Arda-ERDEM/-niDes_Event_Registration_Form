import { Router, type IRouter } from "express";
import nodemailer from "nodemailer";
import { SubmitRegistrationBody } from "@workspace/api-zod";
import { logger } from "../lib/logger";

const router: IRouter = Router();

function buildEmailHtml(data: {
  takimAdi: string;
  takimNumarasi: number;
  katilimcilar: Array<{
    tcKimlik: string;
    isimSoyisim: string;
    gelinenYer: string;
    telefon: string;
    email: string;
    isKaptan: boolean;
  }>;
}): string {
  const kaptan = data.katilimcilar.find((k) => k.isKaptan);

  const participantRows = data.katilimcilar
    .map(
      (p) => `
    <tr style="background-color: ${p.isKaptan ? "#e8f5e9" : "#ffffff"};">
      <td style="padding: 10px; border: 1px solid #ddd;">${p.isKaptan ? "👑 Kaptan" : "Katılımcı"}</td>
      <td style="padding: 10px; border: 1px solid #ddd;">${p.isimSoyisim}</td>
      <td style="padding: 10px; border: 1px solid #ddd;">${p.tcKimlik}</td>
      <td style="padding: 10px; border: 1px solid #ddd;">${p.gelinenYer}</td>
      <td style="padding: 10px; border: 1px solid #ddd;">${p.telefon}</td>
      <td style="padding: 10px; border: 1px solid #ddd;">${p.email}</td>
    </tr>
  `,
    )
    .join("");

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Yeni Takım Kaydı</title>
</head>
<body style="font-family: 'Google Sans', Roboto, Arial, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5;">
  <div style="max-width: 700px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,0.1);">
    
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #4285F4 0%, #0F9D58 50%, #F4B400 75%, #DB4437 100%); padding: 30px; text-align: center;">
      <h1 style="color: white; margin: 0; font-size: 24px; font-weight: 700;">Google Developer Groups</h1>
      <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0 0; font-size: 14px;">On Campus • Samsun University</p>
    </div>

    <!-- Content -->
    <div style="padding: 30px;">
      <h2 style="color: #202124; margin-top: 0;">🎉 Yeni Takım Kaydı Alındı!</h2>
      
      <div style="background: #f8f9fa; border-left: 4px solid #4285F4; padding: 15px; border-radius: 0 8px 8px 0; margin-bottom: 25px;">
        <p style="margin: 0; color: #5f6368; font-size: 14px;">Takım Bilgileri</p>
        <p style="margin: 5px 0 0 0; font-size: 20px; font-weight: 700; color: #202124;">
          ${data.takimAdi}
        </p>
        <p style="margin: 3px 0 0 0; color: #5f6368; font-size: 14px;">Takım No: ${data.takimNumarasi} • ${data.katilimcilar.length} Katılımcı</p>
        ${kaptan ? `<p style="margin: 3px 0 0 0; color: #5f6368; font-size: 14px;">Takım Kaptanı: <strong>${kaptan.isimSoyisim}</strong></p>` : ""}
      </div>

      <h3 style="color: #202124; margin-bottom: 15px;">Katılımcı Listesi</h3>
      
      <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
        <thead>
          <tr style="background: #4285F4; color: white;">
            <th style="padding: 10px; text-align: left; border: 1px solid #3367D6;">Rol</th>
            <th style="padding: 10px; text-align: left; border: 1px solid #3367D6;">İsim Soyisim</th>
            <th style="padding: 10px; text-align: left; border: 1px solid #3367D6;">TC Kimlik</th>
            <th style="padding: 10px; text-align: left; border: 1px solid #3367D6;">Geldiği Yer</th>
            <th style="padding: 10px; text-align: left; border: 1px solid #3367D6;">Telefon</th>
            <th style="padding: 10px; text-align: left; border: 1px solid #3367D6;">E-posta</th>
          </tr>
        </thead>
        <tbody>
          ${participantRows}
        </tbody>
      </table>
    </div>

    <!-- Footer -->
    <div style="background: #f8f9fa; padding: 20px; text-align: center; border-top: 1px solid #e8eaed;">
      <p style="color: #5f6368; margin: 0; font-size: 12px;">
        Bu e-posta Google Developer Groups On Campus Samsun University etkinlik kayıt sistemi tarafından otomatik gönderilmiştir.
      </p>
    </div>
  </div>
</body>
</html>
  `;
}

router.post("/register", async (req, res): Promise<void> => {
  const parsed = SubmitRegistrationBody.safeParse(req.body);
  if (!parsed.success) {
    req.log.warn({ errors: parsed.error.message }, "Invalid registration body");
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { takimAdi, takimNumarasi, katilimcilar } = parsed.data;

  if (katilimcilar.length < 2 || katilimcilar.length > 4) {
    res.status(400).json({ error: "Takımda 2-4 katılımcı olmalıdır." });
    return;
  }

  const kaptanSayisi = katilimcilar.filter((k) => k.isKaptan).length;
  if (kaptanSayisi !== 1) {
    res.status(400).json({ error: "Takımda tam olarak 1 kaptan olmalıdır." });
    return;
  }

  const emailUser = process.env.EMAIL_USER;
  const emailPass = process.env.EMAIL_PASS;
  const targetEmail = process.env.TARGET_EMAIL || "gdscsamsununiversitesi@gmail.com";

  if (!emailUser || !emailPass) {
    logger.warn("EMAIL_USER or EMAIL_PASS not set, email will not be sent");
    res.json({
      success: true,
      message:
        "Kaydınız alındı (e-posta yapılandırması eksik, lütfen yöneticiyle iletişime geçin).",
    });
    return;
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: emailUser,
      pass: emailPass,
    },
  });

  const kaptan = katilimcilar.find((k) => k.isKaptan);

  try {
    await transporter.sendMail({
      from: `"GDG On Campus Samsun University" <${emailUser}>`,
      to: targetEmail,
      subject: `Yeni Takım Kaydı: ${takimAdi} (Takım ${takimNumarasi})`,
      html: buildEmailHtml({ takimAdi, takimNumarasi, katilimcilar }),
      replyTo: kaptan?.email,
    });

    req.log.info({ takimAdi, takimNumarasi }, "Registration email sent");
    res.json({ success: true, message: "Kaydınız başarıyla alındı! E-posta gönderildi." });
  } catch (err) {
    req.log.error({ err }, "Failed to send registration email");
    res.status(500).json({ error: "E-posta gönderilirken bir hata oluştu. Lütfen tekrar deneyin." });
  }
});

export default router;
