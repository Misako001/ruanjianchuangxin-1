import { NextResponse } from 'next/server';

const COMMUNITY_API_BASE_URL =
  process.env.COMMUNITY_API_BASE_URL ?? 'http://localhost:4010';

const COMMUNITY_API_HEADERS = {
  'Content-Type': 'application/json',
  'x-community-dev-token': 'visiongenie-community-dev-token',
};

export async function POST(
  request: Request,
  context: { params: Promise<{ postId: string }> },
) {
  const { postId } = await context.params;
  const body = await request.json();

  const response = await fetch(
    `${COMMUNITY_API_BASE_URL}/community/posts/${postId}/comments`,
    {
      body: JSON.stringify(body),
      headers: COMMUNITY_API_HEADERS,
      method: 'POST',
    },
  );

  if (!response.ok) {
    return NextResponse.json(
      { message: 'Failed to create comment.' },
      { status: response.status },
    );
  }

  return NextResponse.json(await response.json(), { status: response.status });
}
