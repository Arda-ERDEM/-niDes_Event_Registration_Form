import { Router, type Request } from "express";
import nodemailer from "nodemailer";
import * as XLSX from "xlsx";
import fs from "node:fs";
import path from "node:path";
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createClient, type Client } from "@libsql/client";
import { SubmitRegistrationBody } from "@workspace/api-zod";
import { logger } from "../lib/logger.js";

const router = Router();

const SubmitRegistrationWithoutTeamBody = SubmitRegistrationBody.omit({
  takimNumarasi: true,
});

const MAX_TEAM_SLOTS = 15;
const PASSWORD_RESET_TOKEN_TTL_MINUTES = 30;
const DEFAULT_ADMIN_EMAIL = process.env.ADMIN_EMAIL || "ardaerdem.sweng@gmail.com";

function getFrontendBaseUrl(req: Request): string {
  const configuredBaseUrl = process.env.FRONTEND_BASE_URL || process.env.APP_BASE_URL;
  if (configuredBaseUrl) {
    return configuredBaseUrl.replace(/\/$/, "");
  }

  const origin = req.get("origin");
  if (origin) {
    return origin.replace(/\/$/, "");
  }

  return "http://localhost:5173";
}

type Participant = {
  tcKimlik: string;
  isimSoyisim: string;
  gelinenYer: string;
  telefon: string;
  email: string;
  isKaptan: boolean;
  universite: string;
  bolum: string;
};

type RegistrationRecord = {
  id: string;
  createdAt: string;
  takimAdi: string;
  katilimcilar: Participant[];
};

type SlotAssignment = {
  slot: number;
  registrationId: string;
};

type AdminStore = {
  registrations: RegistrationRecord[];
  slotAssignments: SlotAssignment[];
};

const DATA_DIR = path.resolve(process.cwd(), "data");
const STORE_FILE = path.join(DATA_DIR, "admin-store.json");
const LEGACY_STORE_FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../data/admin-store.json");

const tursoUrl = process.env.TURSO_DATABASE_URL || `file:${path.resolve(DATA_DIR, "local.db")}`;
const tursoToken = process.env.TURSO_AUTH_TOKEN;

const db: Client = createClient({
  url: tursoUrl,
  authToken: tursoToken,
});

let dbReadyPromise: Promise<void> | null = null;

function parseAdminStore(raw: string): AdminStore {
  const parsed = JSON.parse(raw) as Partial<AdminStore>;

  return {
    registrations: Array.isArray(parsed.registrations) ? parsed.registrations : [],
    slotAssignments: Array.isArray(parsed.slotAssignments)
      ? parsed.slotAssignments.filter(
          (entry) =>
            Number.isInteger(entry?.slot) &&
            entry.slot >= 1 &&
            entry.slot <= MAX_TEAM_SLOTS &&
            typeof entry.registrationId === "string" &&
            entry.registrationId.length > 0,
        )
      : [],
  };
}

function readStoreFromDisk(): AdminStore {
  try {
    if (fs.existsSync(STORE_FILE)) {
      return parseAdminStore(fs.readFileSync(STORE_FILE, "utf8"));
    }

    if (fs.existsSync(LEGACY_STORE_FILE)) {
      return parseAdminStore(fs.readFileSync(LEGACY_STORE_FILE, "utf8"));
    }
  } catch (error) {
    logger.error({ err: error }, "Failed to read legacy admin store for migration");
  }

  return {
    registrations: [],
    slotAssignments: [],
  };
}

function rowToString(value: unknown): string {
  return value == null ? "" : String(value);
}

function rowToBoolean(value: unknown): boolean {
  return value === 1 || value === "1" || value === true;
}

function createPasswordHash(plainPassword: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(plainPassword, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPasswordHash(plainPassword: string, storedHash: string): boolean {
  const [salt, hash] = storedHash.split(":");
  if (!salt || !hash) {
    return false;
  }

  const computedHash = scryptSync(plainPassword, salt, 64);
  const storedHashBuffer = Buffer.from(hash, "hex");

  if (computedHash.length !== storedHashBuffer.length) {
    return false;
  }

  return timingSafeEqual(computedHash, storedHashBuffer);
}

function generateResetToken(): string {
  return randomBytes(32).toString("base64url");
}

function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function getAdminAccount(): Promise<{ email: string; passwordHash: string } | null> {
  const result = await db.execute({
    sql: "SELECT email, password_hash FROM admin_credentials WHERE id = 1",
  });

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  return {
    email: rowToString(row.email),
    passwordHash: rowToString(row.password_hash),
  };
}

async function verifyAdminPassword(password: string | undefined): Promise<boolean> {
  if (!password) {
    return false;
  }

  const adminAccount = await getAdminAccount();
  if (!adminAccount?.passwordHash) {
    return false;
  }

  return verifyPasswordHash(password, adminAccount.passwordHash);
}

async function initDatabase(): Promise<void> {
  await db.execute("PRAGMA foreign_keys = ON");

  await db.execute(`
    CREATE TABLE IF NOT EXISTS registrations (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      team_name TEXT NOT NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS participants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      registration_id TEXT NOT NULL,
      tc_kimlik TEXT NOT NULL,
      isim_soyisim TEXT NOT NULL,
      gelinen_yer TEXT NOT NULL,
      telefon TEXT NOT NULL,
      email TEXT NOT NULL,
      is_captain INTEGER NOT NULL,
      universite TEXT NOT NULL,
      bolum TEXT NOT NULL,
      FOREIGN KEY (registration_id) REFERENCES registrations(id) ON DELETE CASCADE
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS slot_assignments (
      slot INTEGER PRIMARY KEY,
      registration_id TEXT NOT NULL UNIQUE,
      FOREIGN KEY (registration_id) REFERENCES registrations(id) ON DELETE CASCADE
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS admin_credentials (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      email TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_reset_at TEXT
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS admin_password_resets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      used_at TEXT
    )
  `);

  const existingAdmin = await db.execute({
    sql: "SELECT id FROM admin_credentials WHERE id = 1",
  });

  if (existingAdmin.rows.length === 0) {
    const bootstrapPassword = process.env.ADMIN_PASSWORD || "123456";
    const now = new Date().toISOString();

    await db.execute({
      sql: `
        INSERT INTO admin_credentials (id, email, password_hash, updated_at, last_reset_at)
        VALUES (1, ?, ?, ?, ?)
      `,
      args: [DEFAULT_ADMIN_EMAIL, createPasswordHash(bootstrapPassword), now, now],
    });

    logger.info({ email: DEFAULT_ADMIN_EMAIL }, "Initialized admin credentials in Turso");
  }

  const registrationCount = await db.execute("SELECT COUNT(*) AS count FROM registrations");
  const existingCount = Number(registrationCount.rows[0]?.count ?? 0);

  if (existingCount > 0) {
    return;
  }

  const legacyStore = readStoreFromDisk();
  if (legacyStore.registrations.length === 0) {
    return;
  }

  logger.info({ count: legacyStore.registrations.length }, "Migrating legacy JSON registrations to Turso");

  for (const registration of legacyStore.registrations) {
    await db.execute({
      sql: "INSERT OR IGNORE INTO registrations (id, created_at, team_name) VALUES (?, ?, ?)",
      args: [registration.id, registration.createdAt, registration.takimAdi],
    });

    for (const participant of registration.katilimcilar) {
      await db.execute({
        sql: `
          INSERT INTO participants (
            registration_id, tc_kimlik, isim_soyisim, gelinen_yer,
            telefon, email, is_captain, universite, bolum
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        args: [
          registration.id,
          participant.tcKimlik,
          participant.isimSoyisim,
          participant.gelinenYer,
          participant.telefon,
          participant.email,
          participant.isKaptan ? 1 : 0,
          participant.universite,
          participant.bolum,
        ],
      });
    }
  }

  for (const assignment of legacyStore.slotAssignments) {
    await db.execute({
      sql: "INSERT OR REPLACE INTO slot_assignments (slot, registration_id) VALUES (?, ?)",
      args: [assignment.slot, assignment.registrationId],
    });
  }
}

async function ensureDatabaseReady(): Promise<void> {
  if (!dbReadyPromise) {
    dbReadyPromise = initDatabase().catch((error) => {
      dbReadyPromise = null;
      throw error;
    });
  }

  return dbReadyPromise;
}

async function getSlotAssignments(): Promise<SlotAssignment[]> {
  const result = await db.execute("SELECT slot, registration_id FROM slot_assignments ORDER BY slot ASC");

  return result.rows.map((row) => ({
    slot: Number(row.slot),
    registrationId: rowToString(row.registration_id),
  }));
}

async function getRegistrations(): Promise<RegistrationRecord[]> {
  const regResult = await db.execute("SELECT id, created_at, team_name FROM registrations ORDER BY created_at DESC");
  const participantResult = await db.execute(`
    SELECT
      registration_id,
      tc_kimlik,
      isim_soyisim,
      gelinen_yer,
      telefon,
      email,
      is_captain,
      universite,
      bolum
    FROM participants
    ORDER BY id ASC
  `);

  const participantsByRegistrationId = new Map<string, Participant[]>();

  for (const row of participantResult.rows) {
    const registrationId = rowToString(row.registration_id);
    const bucket = participantsByRegistrationId.get(registrationId) ?? [];

    bucket.push({
      tcKimlik: rowToString(row.tc_kimlik),
      isimSoyisim: rowToString(row.isim_soyisim),
      gelinenYer: rowToString(row.gelinen_yer),
      telefon: rowToString(row.telefon),
      email: rowToString(row.email),
      isKaptan: rowToBoolean(row.is_captain),
      universite: rowToString(row.universite),
      bolum: rowToString(row.bolum),
    });

    participantsByRegistrationId.set(registrationId, bucket);
  }

  return regResult.rows.map((row) => {
    const id = rowToString(row.id);

    return {
      id,
      createdAt: rowToString(row.created_at),
      takimAdi: rowToString(row.team_name),
      katilimcilar: participantsByRegistrationId.get(id) ?? [],
    };
  });
}

function buildEmailHtml(data: {
  takimAdi: string;
  katilimcilar: Participant[];
}): string {
  const kaptan = data.katilimcilar.find((k) => k.isKaptan);

  const participantRows = data.katilimcilar
    .map(
      (p) => `
    <tr style="background-color: ${p.isKaptan ? "#e8f5e9" : "#ffffff"};">
      <td style="padding: 10px; border: 1px solid #ddd;">${p.isKaptan ? "Kaptan" : "Katilimci"}</td>
      <td style="padding: 10px; border: 1px solid #ddd;">${p.isimSoyisim}</td>
      <td style="padding: 10px; border: 1px solid #ddd;">${p.tcKimlik}</td>
      <td style="padding: 10px; border: 1px solid #ddd;">${p.universite}</td>
      <td style="padding: 10px; border: 1px solid #ddd;">${p.bolum}</td>
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
  <title>Yeni Takim Kaydi</title>
</head>
<body style="font-family: 'Google Sans', Roboto, Arial, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5;">
  <div style="max-width: 750px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,0.1);">
    <div style="background: linear-gradient(135deg, #4285F4 0%, #0F9D58 50%, #F4B400 75%, #DB4437 100%); padding: 30px; text-align: center;">
      <h1 style="color: white; margin: 0; font-size: 24px; font-weight: 700;">Google Developer Groups</h1>
      <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0 0; font-size: 14px;">On Campus • Samsun University</p>
    </div>

    <div style="padding: 30px;">
      <h2 style="color: #202124; margin-top: 0;">Yeni Takim Kaydi Alindi!</h2>

      <div style="background: #f8f9fa; border-left: 4px solid #4285F4; padding: 15px; border-radius: 0 8px 8px 0; margin-bottom: 25px;">
        <p style="margin: 0; color: #5f6368; font-size: 14px;">Takim Bilgileri</p>
        <p style="margin: 5px 0 0 0; font-size: 20px; font-weight: 700; color: #202124;">
          ${data.takimAdi}
        </p>
        <p style="margin: 3px 0 0 0; color: #5f6368; font-size: 14px;">${data.katilimcilar.length} Katilimci</p>
        ${kaptan ? `<p style="margin: 3px 0 0 0; color: #5f6368; font-size: 14px;">Takim Kaptani: <strong>${kaptan.isimSoyisim}</strong></p>` : ""}
      </div>

      <h3 style="color: #202124; margin-bottom: 15px;">Katilimci Listesi</h3>

      <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
        <thead>
          <tr style="background: #4285F4; color: white;">
            <th style="padding: 10px; text-align: left; border: 1px solid #3367D6;">Rol</th>
            <th style="padding: 10px; text-align: left; border: 1px solid #3367D6;">Isim Soyisim</th>
            <th style="padding: 10px; text-align: left; border: 1px solid #3367D6;">TC Kimlik</th>
            <th style="padding: 10px; text-align: left; border: 1px solid #3367D6;">Universite</th>
            <th style="padding: 10px; text-align: left; border: 1px solid #3367D6;">Bolum</th>
            <th style="padding: 10px; text-align: left; border: 1px solid #3367D6;">Gelinen Yer</th>
            <th style="padding: 10px; text-align: left; border: 1px solid #3367D6;">Telefon</th>
            <th style="padding: 10px; text-align: left; border: 1px solid #3367D6;">E-Posta</th>
          </tr>
        </thead>
        <tbody>
          ${participantRows}
        </tbody>
      </table>
    </div>
  </div>
</body>
</html>
  `;
}

function applyWorksheetLayout(worksheet: XLSX.WorkSheet, columnWidths: number[]): void {
  if (!worksheet["!ref"]) return;

  const range = XLSX.utils.decode_range(worksheet["!ref"]);
  const totalRows = range.e.r - range.s.r + 1;

  worksheet["!cols"] = columnWidths.map((wch) => ({ wch }));
  worksheet["!rows"] = Array.from({ length: totalRows }, (_, index) =>
    index === 0 ? { hpt: 26 } : { hpt: 21 },
  );

  for (let col = range.s.c; col <= range.e.c; col += 1) {
    const headerRef = XLSX.utils.encode_cell({ r: 0, c: col });
    if (worksheet[headerRef]) {
      worksheet[headerRef].s = {
        font: { bold: true, color: { rgb: "FFFFFFFF" } },
        fill: { fgColor: { rgb: "1F4E78" } },
        alignment: { horizontal: "center", vertical: "center", wrapText: true },
      };
    }
  }

  for (let row = 1; row <= range.e.r; row += 1) {
    for (let col = range.s.c; col <= range.e.c; col += 1) {
      const cellRef = XLSX.utils.encode_cell({ r: row, c: col });
      if (!worksheet[cellRef]) continue;

      worksheet[cellRef].s = {
        alignment: { vertical: "top", horizontal: "left", wrapText: true },
      };
    }
  }

  const firstCell = XLSX.utils.encode_cell({ r: 0, c: range.s.c });
  const lastCell = XLSX.utils.encode_cell({ r: range.e.r, c: range.e.c });
  worksheet["!autofilter"] = { ref: `${firstCell}:${lastCell}` };
}

router.post("/admin/login", async (req, res): Promise<void> => {
  await ensureDatabaseReady();

  const password = typeof req.body?.password === "string" ? req.body.password : undefined;

  if (!(await verifyAdminPassword(password))) {
    res.status(401).json({ error: "Admin sifresi hatali." });
    return;
  }

  const registrations = await getRegistrations();
  const slotAssignments = await getSlotAssignments();

  res.json({
    success: true,
    registrations,
    slotAssignments,
  });
});

router.get("/admin/registrations", async (req, res): Promise<void> => {
  await ensureDatabaseReady();

  const headerPassword =
    typeof req.headers["x-admin-password"] === "string"
      ? req.headers["x-admin-password"]
      : undefined;

  if (!(await verifyAdminPassword(headerPassword))) {
    res.status(401).json({ error: "Admin yetkisi yok." });
    return;
  }

  const registrations = await getRegistrations();
  const slotAssignments = await getSlotAssignments();

  res.json({ registrations, slotAssignments });
});

router.put("/admin/team-slot-assignment/:id", async (req, res): Promise<void> => {
  await ensureDatabaseReady();

  const headerPassword =
    typeof req.headers["x-admin-password"] === "string"
      ? req.headers["x-admin-password"]
      : undefined;

  if (!(await verifyAdminPassword(headerPassword))) {
    res.status(401).json({ error: "Admin yetkisi yok." });
    return;
  }

  const { id } = req.params;
  const slot = req.body?.slot;

  if (slot !== null && (!Number.isInteger(slot) || slot < 1 || slot > MAX_TEAM_SLOTS)) {
    res.status(400).json({ error: `slot alani 1-${MAX_TEAM_SLOTS} arasi olmali veya null olmalidir.` });
    return;
  }

  const existsResult = await db.execute({
    sql: "SELECT id FROM registrations WHERE id = ?",
    args: [id],
  });

  if (existsResult.rows.length === 0) {
    res.status(404).json({ error: "Kayit bulunamadi." });
    return;
  }

  await db.execute({
    sql: "DELETE FROM slot_assignments WHERE registration_id = ?",
    args: [id],
  });

  if (slot !== null) {
    await db.execute({
      sql: "INSERT OR REPLACE INTO slot_assignments (slot, registration_id) VALUES (?, ?)",
      args: [slot, id],
    });
  }

  const slotAssignments = await getSlotAssignments();

  res.json({
    success: true,
    slotAssignments,
  });
});

router.put("/admin/registrations/:id", async (req, res): Promise<void> => {
  await ensureDatabaseReady();

  const headerPassword =
    typeof req.headers["x-admin-password"] === "string"
      ? req.headers["x-admin-password"]
      : undefined;

  if (!(await verifyAdminPassword(headerPassword))) {
    res.status(401).json({ error: "Admin yetkisi yok." });
    return;
  }

  const { id } = req.params;
  const parsed = SubmitRegistrationWithoutTeamBody.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { takimAdi, katilimcilar } = parsed.data;

  if (katilimcilar.length < 2 || katilimcilar.length > 4) {
    res.status(400).json({ error: "Takimda 2-4 katilimci olmalidir." });
    return;
  }

  const kaptanSayisi = katilimcilar.filter((k) => k.isKaptan).length;
  if (kaptanSayisi !== 1) {
    res.status(400).json({ error: "Takimda tam olarak 1 kaptan olmalidir." });
    return;
  }

  const existsResult = await db.execute({
    sql: "SELECT id FROM registrations WHERE id = ?",
    args: [id],
  });

  if (existsResult.rows.length === 0) {
    res.status(404).json({ error: "Kayit bulunamadi." });
    return;
  }

  await db.execute({
    sql: "UPDATE registrations SET team_name = ? WHERE id = ?",
    args: [takimAdi, id],
  });

  await db.execute({
    sql: "DELETE FROM participants WHERE registration_id = ?",
    args: [id],
  });

  for (const participant of katilimcilar) {
    await db.execute({
      sql: `
        INSERT INTO participants (
          registration_id, tc_kimlik, isim_soyisim, gelinen_yer,
          telefon, email, is_captain, universite, bolum
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        id,
        participant.tcKimlik,
        participant.isimSoyisim,
        participant.gelinenYer,
        participant.telefon,
        participant.email,
        participant.isKaptan ? 1 : 0,
        participant.universite,
        participant.bolum,
      ],
    });
  }

  const registrations = await getRegistrations();
  const updatedRegistration = registrations.find((registration) => registration.id === id);

  res.json({
    success: true,
    registration: updatedRegistration,
  });
});

router.delete("/admin/registrations/:id", async (req, res): Promise<void> => {
  await ensureDatabaseReady();

  const headerPassword =
    typeof req.headers["x-admin-password"] === "string"
      ? req.headers["x-admin-password"]
      : undefined;

  if (!(await verifyAdminPassword(headerPassword))) {
    res.status(401).json({ error: "Admin yetkisi yok." });
    return;
  }

  const { id } = req.params;

  const existsResult = await db.execute({
    sql: "SELECT id FROM registrations WHERE id = ?",
    args: [id],
  });

  if (existsResult.rows.length === 0) {
    res.status(404).json({ error: "Kayit bulunamadi." });
    return;
  }

  await db.execute({
    sql: "DELETE FROM registrations WHERE id = ?",
    args: [id],
  });

  res.json({ success: true, message: "Kayit silindi." });
});

router.post("/register", async (req, res): Promise<void> => {
  await ensureDatabaseReady();

  const parsed = SubmitRegistrationWithoutTeamBody.safeParse(req.body);
  if (!parsed.success) {
    req.log.warn({ errors: parsed.error.message }, "Invalid registration body");
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { takimAdi, katilimcilar } = parsed.data;

  if (katilimcilar.length < 2 || katilimcilar.length > 4) {
    res.status(400).json({ error: "Takimda 2-4 katilimci olmalidir." });
    return;
  }

  const kaptanSayisi = katilimcilar.filter((k) => k.isKaptan).length;
  if (kaptanSayisi !== 1) {
    res.status(400).json({ error: "Takimda tam olarak 1 kaptan olmalidir." });
    return;
  }

  const registrationId = `REG-${Date.now()}`;
  const createdAt = new Date().toISOString();

  await db.execute({
    sql: "INSERT INTO registrations (id, created_at, team_name) VALUES (?, ?, ?)",
    args: [registrationId, createdAt, takimAdi],
  });

  for (const participant of katilimcilar) {
    await db.execute({
      sql: `
        INSERT INTO participants (
          registration_id, tc_kimlik, isim_soyisim, gelinen_yer,
          telefon, email, is_captain, universite, bolum
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        registrationId,
        participant.tcKimlik,
        participant.isimSoyisim,
        participant.gelinenYer,
        participant.telefon,
        participant.email,
        participant.isKaptan ? 1 : 0,
        participant.universite,
        participant.bolum,
      ],
    });
  }

  res.json({
    success: true,
    message: "Kaydiniz basariyla alindi! Secilen takimlar admin panelden bilgilendirilecektir.",
  });
});

router.post("/admin/send-notifications", async (req, res): Promise<void> => {
  await ensureDatabaseReady();

  const headerPassword =
    typeof req.headers["x-admin-password"] === "string"
      ? req.headers["x-admin-password"]
      : undefined;

  if (!(await verifyAdminPassword(headerPassword))) {
    res.status(401).json({ error: "Admin yetkisi yok." });
    return;
  }

  const emailUser = process.env.EMAIL_USER;
  const emailPass = process.env.EMAIL_PASS;
  const targetEmail = process.env.TARGET_EMAIL || "ardaerdem.sweng@gmail.com";

  if (!emailUser || !emailPass) {
    logger.warn("EMAIL_USER or EMAIL_PASS not set, email will not be sent");
    res.status(400).json({ error: "E-posta yapilandirmasi eksik." });
    return;
  }

  const registrations = await getRegistrations();
  const slotAssignments = await getSlotAssignments();

  const byId = new Map(registrations.map((registration) => [registration.id, registration]));
  const selectedRegistrations = slotAssignments
    .map((assignment) => byId.get(assignment.registrationId))
    .filter((registration): registration is RegistrationRecord => Boolean(registration));

  if (selectedRegistrations.length === 0) {
    res.status(400).json({ error: "Secilen takim yok." });
    return;
  }

  const allRows = selectedRegistrations.flatMap((registration) =>
    registration.katilimcilar.map((participant, index) => ({
      "Takim Adi": registration.takimAdi,
      "Kayit ID": registration.id,
      "Kayit Tarihi": registration.createdAt,
      "Katilimci Sira No": index + 1,
      Rol: participant.isKaptan ? "Kaptan" : "Katilimci",
      "Isim Soyisim": participant.isimSoyisim,
      "TC Kimlik": participant.tcKimlik,
      Universite: participant.universite,
      Bolum: participant.bolum,
      "Gelinen Yer": participant.gelinenYer,
      Telefon: participant.telefon,
      "E-Posta": participant.email,
    })),
  );

  const worksheet = XLSX.utils.json_to_sheet(allRows);
  applyWorksheetLayout(worksheet, [24, 18, 22, 15, 12, 24, 16, 22, 20, 16, 15, 28]);

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Secilen 15 Takim");

  const summaryRows = selectedRegistrations.map((registration) => {
    const kaptan = registration.katilimcilar.find((k) => k.isKaptan);
    return {
      "Takim Adi": registration.takimAdi,
      "Kaptan Adi": kaptan?.isimSoyisim || "",
      "Kaptan E-Posta": kaptan?.email || "",
      "Kaptan Telefon": kaptan?.telefon || "",
      "Katilimci Sayisi": registration.katilimcilar.length,
    };
  });

  const summaryWorksheet = XLSX.utils.json_to_sheet(summaryRows);
  applyWorksheetLayout(summaryWorksheet, [24, 24, 28, 18, 15]);
  XLSX.utils.book_append_sheet(workbook, summaryWorksheet, "Takim Ozeti");

  const finalExcelBuffer = XLSX.write(workbook, {
    bookType: "xlsx",
    type: "buffer",
  }) as Buffer;

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: emailUser,
      pass: emailPass,
    },
  });

  try {
    await transporter.sendMail({
      from: `"GDG On Campus Samsun University" <${emailUser}>`,
      to: targetEmail,
      subject: `Final 15 Takim Bilgileri - ${new Date().toLocaleDateString("tr-TR")}`,
      html: buildEmailHtml({
        takimAdi: "Final Takim Listesi",
        katilimcilar: selectedRegistrations.flatMap((registration) => registration.katilimcilar),
      }),
      attachments: [
        {
          filename: `final_15_takim_${Date.now()}.xlsx`,
          content: finalExcelBuffer,
          contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        },
      ],
    });

    logger.info({ teamsCount: selectedRegistrations.length }, "Final 15 teams notification sent");

    res.json({
      success: true,
      message: `${selectedRegistrations.length} takimin bilgileri ${targetEmail} adresine gonderildi.`,
    });
  } catch (err) {
    logger.error({ err }, "Failed to send notification email");
    res.status(500).json({ error: "E-posta gonderilirken bir hata olustu. Lutfen tekrar deneyin." });
  }
});

router.post("/admin/forgot-password", async (req, res): Promise<void> => {
  await ensureDatabaseReady();

  const emailUser = process.env.EMAIL_USER;
  const emailPass = process.env.EMAIL_PASS;

  if (!emailUser || !emailPass) {
    logger.warn("EMAIL_USER or EMAIL_PASS not set, cannot send forgot-password email");
    res.status(400).json({ error: "E-posta yapilandirmasi eksik." });
    return;
  }

  const adminAccount = await getAdminAccount();
  if (!adminAccount) {
    res.status(500).json({ error: "Admin hesabi bulunamadi." });
    return;
  }

  const resetToken = generateResetToken();
  const resetTokenHash = hashResetToken(resetToken);
  const now = new Date();
  const nowIso = now.toISOString();
  const expiresAtIso = new Date(now.getTime() + PASSWORD_RESET_TOKEN_TTL_MINUTES * 60_000).toISOString();
  const frontendBaseUrl = getFrontendBaseUrl(req);
  const resetUrl = `${frontendBaseUrl}/admin/reset-password?token=${encodeURIComponent(resetToken)}`;

  await db.execute({
    sql: "DELETE FROM admin_password_resets WHERE used_at IS NOT NULL OR expires_at <= ?",
    args: [nowIso],
  });

  await db.execute({
    sql: "INSERT INTO admin_password_resets (token_hash, expires_at, created_at, used_at) VALUES (?, ?, ?, NULL)",
    args: [resetTokenHash, expiresAtIso, nowIso],
  });

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: emailUser,
      pass: emailPass,
    },
  });

  try {
    await transporter.sendMail({
      from: `"GDG On Campus Samsun University" <${emailUser}>`,
      to: adminAccount.email,
      subject: "Admin sifresi sifirlama",
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6;">
          <h2>Admin sifre sifirlama talebi</h2>
          <p>Sifre yenilemek icin asagidaki butona basin.</p>
          <p style="margin: 20px 0;">
            <a href="${resetUrl}" style="display: inline-block; background: #1d4ed8; color: white; text-decoration: none; padding: 10px 16px; border-radius: 8px; font-weight: 600;">
              Sifreyi Yenile
            </a>
          </p>
          <p>Baglanti ${PASSWORD_RESET_TOKEN_TTL_MINUTES} dakika gecerlidir.</p>
          <p>Eger bu islemi siz yapmadiysaniz bu e-postayi yok sayabilirsiniz.</p>
        </div>
      `,
    });

    res.json({
      success: true,
      message: `Sifre yenileme baglantisi ${adminAccount.email} adresine gonderildi.`,
      ...(process.env.NODE_ENV !== "production" ? { previewResetUrl: resetUrl } : {}),
    });
  } catch (err) {
    logger.error({ err }, "Failed to send forgot-password email");
    res.status(500).json({ error: "Sifirlama e-postasi gonderilemedi. Lutfen tekrar deneyin." });
  }
});

router.post("/admin/reset-password", async (req, res): Promise<void> => {
  await ensureDatabaseReady();

  const token = typeof req.body?.token === "string" ? req.body.token : undefined;
  const newPassword = typeof req.body?.newPassword === "string" ? req.body.newPassword : undefined;
  const confirmPassword = typeof req.body?.confirmPassword === "string" ? req.body.confirmPassword : undefined;

  if (!token || !newPassword || !confirmPassword) {
    res.status(400).json({ error: "Token, yeni sifre ve tekrar sifre zorunludur." });
    return;
  }

  if (newPassword.length < 6 || newPassword.length > 128) {
    res.status(400).json({ error: "Yeni sifre 6-128 karakter arasinda olmalidir." });
    return;
  }

  if (newPassword !== confirmPassword) {
    res.status(400).json({ error: "Yeni sifre ve tekrar sifresi ayni olmalidir." });
    return;
  }

  const nowIso = new Date().toISOString();
  const tokenHash = hashResetToken(token);

  const tokenResult = await db.execute({
    sql: `
      SELECT id, expires_at, used_at
      FROM admin_password_resets
      WHERE token_hash = ?
      ORDER BY id DESC
      LIMIT 1
    `,
    args: [tokenHash],
  });

  const resetRow = tokenResult.rows[0];

  if (!resetRow) {
    res.status(400).json({ error: "Gecersiz sifre yenileme baglantisi." });
    return;
  }

  if (resetRow.used_at) {
    res.status(400).json({ error: "Bu sifre yenileme baglantisi daha once kullanilmis." });
    return;
  }

  const expiresAt = rowToString(resetRow.expires_at);
  if (!expiresAt || expiresAt <= nowIso) {
    res.status(400).json({ error: "Sifre yenileme baglantisinin suresi dolmus." });
    return;
  }

  await db.execute({
    sql: "UPDATE admin_credentials SET password_hash = ?, updated_at = ?, last_reset_at = ? WHERE id = 1",
    args: [createPasswordHash(newPassword), nowIso, nowIso],
  });

  await db.execute({
    sql: "UPDATE admin_password_resets SET used_at = ? WHERE id = ?",
    args: [nowIso, resetRow.id],
  });

  res.json({
    success: true,
    message: "Sifreniz basariyla guncellendi.",
  });
});

export default router;
