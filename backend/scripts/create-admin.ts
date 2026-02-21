/**
 * One-off script: create admin user.
 * Run from backend: npx ts-node scripts/create-admin.ts
 *
 * Password: set ADMIN_PASSWORD in .env, or a random one is generated and printed once.
 */
import dotenv from "dotenv";
import path from "path";
import crypto from "crypto";

dotenv.config({ path: path.join(__dirname, "..", ".env") });
dotenv.config({ path: path.join(__dirname, "..", ".env.local") });

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@trading.local";

function generateSecurePassword(length = 24): string {
  const symbols = "!@#$%&*_-+=.";
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghjkmnpqrstuvwxyz";
  const digits = "23456789";
  const all = upper + lower + digits + symbols;
  let pass = "";
  pass += upper[crypto.randomInt(0, upper.length)];
  pass += lower[crypto.randomInt(0, lower.length)];
  pass += digits[crypto.randomInt(0, digits.length)];
  pass += symbols[crypto.randomInt(0, symbols.length)];
  for (let i = pass.length; i < length; i++) {
    pass += all[crypto.randomInt(0, all.length)];
  }
  return pass
    .split("")
    .sort(() => crypto.randomInt(0, 2) - 1)
    .join("");
}

async function main() {
  const raw =
    process.env.ADMIN_PASSWORD?.trim() ||
    generateSecurePassword();
  if (!raw || raw.length < 12) {
    console.error("ADMIN_PASSWORD must be at least 12 characters. Set it in .env or leave unset to generate one.");
    process.exit(1);
  }
  const hash = await bcrypt.hash(raw, 12);
  const existing = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });
  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: { isAdmin: true, password: hash }
    });
    console.log("Admin already exists; updated isAdmin and password.");
  } else {
    await prisma.user.create({
      data: {
        email: ADMIN_EMAIL,
        password: hash,
        isAdmin: true
      }
    });
    console.log("Admin user created.");
  }
  console.log("\n--- Admin login ---");
  console.log("Email:   ", ADMIN_EMAIL);
  if (!process.env.ADMIN_PASSWORD?.trim()) {
    console.log("Password: (generated — save it, it won't be shown again)");
    console.log(raw);
  } else {
    console.log("Password: задан в .env (ADMIN_PASSWORD)");
  }
  console.log("---\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
