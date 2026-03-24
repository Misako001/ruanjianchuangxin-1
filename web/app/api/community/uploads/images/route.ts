import { NextResponse } from 'next/server';

const COMMUNITY_API_BASE_URL =
  process.env.COMMUNITY_API_BASE_URL ?? 'http://localhost:4010';

const COMMUNITY_API_HEADERS = {
  'Content-Type': 'application/json',
  'x-community-dev-token': 'visiongenie-community-dev-token',
};

export async function POST(request: Request) {
  const body = await request.json();

  const response = await fetch(`${COMMUNITY_API_BASE_URL}/community/uploads/images`, {
    body: JSON.stringify(body),
    headers: COMMUNITY_API_HEADERS,
    method: 'POST',
  });

  if (!response.ok) {
    let message = 'Failed to upload image.';

    try {
      const payload = (await response.json()) as { message?: unknown };
      if (typeof payload.message === 'string' && payload.message.trim()) {
        message = payload.message;
      }
    } catch {}

    return NextResponse.json({ message }, { status: response.status });
  }

  const payload = (await response.json()) as {
    height: number;
    mimeType: string;
    url: string;
    width: number;
  };

  return NextResponse.json(
    {
      ...payload,
      url: payload.url.startsWith('http://') || payload.url.startsWith('https://')
        ? payload.url
        : `${COMMUNITY_API_BASE_URL}${payload.url}`,
    },
    { status: response.status },
  );
}
