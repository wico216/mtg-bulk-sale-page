import { NextResponse } from "next/server";
import { QA_GATE_COOKIE_NAME } from "@/lib/qa-gate-auth";

export async function POST(request: Request) {
  const response = NextResponse.redirect(new URL("/qa/login", request.url), {
    status: 303,
  });
  response.cookies.set(QA_GATE_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
