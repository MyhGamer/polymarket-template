import { NextResponse } from "next/server"

const GAMMA_BASE_URL = "https://gamma-api.polymarket.com"

const ALLOWED_PATHS = ["markets", "events", "public-search"]

function handler(request: Request) {
  const url = new URL(request.url)
  const pathSegments = url.pathname.replace(/^\/api\/gamma\/?/, "").split("/")
  const basePath = pathSegments[0]

  if (!basePath || !ALLOWED_PATHS.includes(basePath)) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 })
  }

  const gammaUrl = `${GAMMA_BASE_URL}/${pathSegments.join("/")}${url.search}`

  return fetch(gammaUrl, {
    method: request.method,
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
  }).then((resp) =>
    new NextResponse(resp.body, {
      status: resp.status,
      headers: { "Content-Type": resp.headers.get("Content-Type") || "application/json" },
    })
  ).catch(() =>
    NextResponse.json({ error: "Gamma request failed" }, { status: 502 })
  )
}

export const GET = handler
