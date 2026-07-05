"use server";

import { cookies } from "next/headers";
import { SignJWT } from "jose";

export async function login(formData: FormData) {
  const password = formData.get("password") as string;

  if (!password) {
    return { error: "Password is required" };
  }

  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    return {
      error: "Server configuration error: ADMIN_PASSWORD is not set in .env.local",
    };
  }

  if (password !== adminPassword) {
    return { error: "Incorrect password" };
  }

  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret) {
    return {
      error: "Server configuration error: SESSION_SECRET is not set in .env.local",
    };
  }

  const secret = new TextEncoder().encode(sessionSecret);
  const token = await new SignJWT({ role: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("7d")
    .sign(secret);

  const cookieStore = await cookies();
  cookieStore.set("jrsid_admin_session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });

  return { success: true };
}

export async function logout(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete("jrsid_admin_session");
}
