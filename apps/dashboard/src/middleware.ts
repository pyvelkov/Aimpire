import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { isDashboardOwner } from "./lib/approval";

function copyCookies(from: NextResponse, to: NextResponse): NextResponse {
  from.cookies.getAll().forEach((cookie) => {
    to.cookies.set(cookie);
  });
  return to;
}

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isApi = path.startsWith("/api/");
  const isLogin = path === "/login";
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  const ownerEmail = process.env.DASHBOARD_OWNER_EMAIL;

  if (!supabaseUrl || !supabaseAnonKey || !ownerEmail) {
    if (isApi) {
      return NextResponse.json(
        { error: "Dashboard authentication is not configured" },
        { status: 503 },
      );
    }

    if (isLogin) {
      return NextResponse.next();
    }

    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("error", "config");
    return NextResponse.redirect(url);
  }

  let supabaseResponse = NextResponse.next({ request });
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          supabaseResponse.cookies.set(name, value, options);
        });
      },
    },
  });

  const { data } = await supabase.auth.getUser();
  const user = data.user;

  if (user && !isDashboardOwner(user.email, ownerEmail)) {
    await supabase.auth.signOut();

    if (isApi) {
      return copyCookies(
        supabaseResponse,
        NextResponse.json(
          { error: "This dashboard is limited to the Aimpire owner" },
          { status: 403 },
        ),
      );
    }

    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("error", "owner");
    return copyCookies(supabaseResponse, NextResponse.redirect(url));
  }

  if (!user && !isLogin) {
    if (isApi) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 },
      );
    }

    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return copyCookies(supabaseResponse, NextResponse.redirect(url));
  }

  if (user && isLogin) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return copyCookies(supabaseResponse, NextResponse.redirect(url));
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
